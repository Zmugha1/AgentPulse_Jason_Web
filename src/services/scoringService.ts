import { getSupabaseClient } from '../lib/getSupabaseClient'
import type { Lead, LeadStatus, ScoringResult } from '../lib/types'
const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, has_home_to_sell, buying_or_renting, lender_status, budget_max, listing_price, created_at, updated_at'

const BATCH_SIZE = 100

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

/** Lead age in days from `original_lead_date` (desktop J-2c). */
export function leadAgeDays(lead: Lead): number | null {
  return daysSince(lead.original_lead_date)
}

function priceSignal(lead: Lead): number {
  const price = lead.budget_max ?? lead.listing_price
  if (price === null || price === undefined) return 1
  if (price >= 800_000) return 4
  if (price >= 600_000) return 3
  if (price >= 450_000) return 2
  if (price >= 300_000) return 1
  return 0
}

function recencySignal(lead: Lead): number {
  const age = leadAgeDays(lead)
  if (age === null) return 1
  const months = age / 30.4375
  if (months <= 6) return 3
  if (months <= 18) return 2
  if (months <= 36) return 1
  return 0
}

function hasUsablePhone(phone: string | null): boolean {
  return Boolean(phone && phone.replace(/\D/g, '').length >= 10)
}

function hasUsableEmail(email: string | null): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
}

function contactabilitySignal(lead: Lead): number {
  return hasUsablePhone(lead.phone) && hasUsableEmail(lead.email) ? 1 : 0
}

function engagementSignal(lead: Lead): number {
  const stage = (lead.pipeline_stage ?? 'new').toLowerCase()
  if (stage === 'showing' || stage === 'offer' || stage === 'appointment') {
    return 2
  }
  if (stage === 'contacted' || stage === 'nurture') return 1
  return 0
}

function computeTotalScore(lead: Lead): number {
  const stage = (lead.pipeline_stage ?? 'new').toLowerCase()

  if (stage === 'dead' || stage === 'closed') {
    return 0
  }

  const total =
    priceSignal(lead) +
    recencySignal(lead) +
    contactabilitySignal(lead) +
    engagementSignal(lead)

  return Math.max(0, Math.min(10, total))
}

function scoreToStatus(score: number): LeadStatus {
  if (score >= 8) return 'hot'
  if (score >= 5) return 'warm'
  return 'cold'
}

/**
 * Pure J-2c scoring for one lead (no database writes).
 * Same weights and bands as desktop `leadScoring.ts`.
 */
export function scoreLead(lead: Lead): ScoringResult {
  const score = computeTotalScore(lead)
  return { score, status: scoreToStatus(score) }
}

async function fetchAllLeadsForRescore(): Promise<Lead[]> {
  const { data, error } = await getSupabaseClient().from('leads').select(LEAD_SELECT)
  if (error) {
    console.error('[scoringService] fetchAllLeadsForRescore:', error.message)
    throw new Error(`fetchAllLeadsForRescore: ${error.message}`)
  }
  return (data ?? []) as Lead[]
}

/**
 * Recompute J-2c scores for every lead and persist `score` + `status` in Supabase.
 * Node scripts use the service role client; the browser uses the logged-in session.
 */
export async function rescoreAllLeads(): Promise<{ updated: number }> {
  const client = getSupabaseClient()
  const leads = await fetchAllLeadsForRescore()
  let updated = 0

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE)

    const results = await Promise.all(
      batch.map(async (lead) => {
        const { score, status } = scoreLead(lead)
        const { error } = await client
          .from('leads')
          .update({
            score,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        if (error) {
          throw new Error(
            `rescoreAllLeads batch ${batchNum}/${totalBatches} id ${lead.id}: ${error.message}`,
          )
        }
        return true
      }),
    )

    updated += results.length
    console.log(
      `[scoringService] Batch ${batchNum}/${totalBatches}: updated ${batch.length} (total ${updated}/${leads.length})`,
    )
  }

  return { updated }
}
