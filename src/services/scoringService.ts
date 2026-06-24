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

function hasUsablePhone(phone: string | null): boolean {
  return Boolean(phone && phone.replace(/\D/g, '').length >= 10)
}

function hasUsableEmail(email: string | null): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
}

const HOT_SOURCES = new Set([
  'realtor.com',
  'realtor_com_full',
  'realtor_contacts',
  'realtor_com_connections_plus',
  'website_chatbot',
  'website_valuation',
])

const WARM_SOURCES = new Set([
  'website_newsletter',
  'website_ai_referral',
  'referral_past_client',
])

function normalizeSource(source: string | null): string {
  return (source ?? '').trim().toLowerCase()
}

function sourceQualitySignal(lead: Lead): number {
  const source = normalizeSource(lead.source)
  if (HOT_SOURCES.has(source)) return 4
  if (WARM_SOURCES.has(source)) return 2
  return 0
}

function recencySignal(lead: Lead): number {
  const ageDays = leadAgeDays(lead)
  if (ageDays === null) return 0
  if (ageDays <= 7) return 4
  if (ageDays <= 30) return 3
  if (ageDays <= 90) return 2
  if (ageDays <= 365) return 1
  return 0
}

function contactInfoSignal(lead: Lead): number {
  const hasPhone = hasUsablePhone(lead.phone)
  const hasEmail = hasUsableEmail(lead.email)
  if (hasPhone && hasEmail) return 2
  if (hasPhone || hasEmail) return 1
  return -2
}

function hasPurposeNotes(lead: Lead): boolean {
  const purpose = lead.purpose?.trim()
  if (!purpose) return false
  return purpose.toLowerCase() !== 'not set'
}

function pipelineStageEngagementSignal(lead: Lead): number {
  const stage = (lead.pipeline_stage ?? 'new').toLowerCase()
  if (stage === 'contacted' || stage === 'appointment' || stage === 'showing') {
    return 3
  }
  if (stage === 'attempted' || stage === 'nurture') {
    return 1
  }
  return 0
}

function lastContactEngagementSignal(lead: Lead): number {
  const days = daysSince(lead.last_contact_at)
  if (days === null) return 0
  if (days <= 7) return 2
  if (days <= 30) return 1
  return 0
}

function engagementSignal(lead: Lead): number {
  let total = 0
  if (hasPurposeNotes(lead)) total += 2
  total += pipelineStageEngagementSignal(lead)
  total += lastContactEngagementSignal(lead)
  return total
}

function homeToSellSignal(lead: Lead): number {
  return lead.has_home_to_sell ? 3 : 0
}

function staleNewLeadPenalty(lead: Lead): number {
  const stage = (lead.pipeline_stage ?? 'new').toLowerCase()
  if (stage !== 'new') return 0
  if (lead.last_contact_at) return 0

  const ageDays = leadAgeDays(lead)
  if (ageDays === null) return 0
  if (ageDays >= 730) return -4
  if (ageDays >= 365) return -2
  return 0
}

function computeTotalScore(lead: Lead): number {
  const stage = (lead.pipeline_stage ?? 'new').toLowerCase()
  if (stage === 'dead' || stage === 'closed') {
    return 0
  }

  return (
    sourceQualitySignal(lead) +
    recencySignal(lead) +
    contactInfoSignal(lead) +
    engagementSignal(lead) +
    homeToSellSignal(lead) +
    staleNewLeadPenalty(lead)
  )
}

function scoreToStatus(score: number): LeadStatus {
  if (score >= 10) return 'hot'
  if (score >= 6) return 'warm'
  if (score >= 3) return 'cold'
  return 'dead'
}

/**
 * Score one lead from source quality, recency, contact info, engagement,
 * home-to-sell, and stale-new penalties. Status mapping in scoreToStatus().
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
