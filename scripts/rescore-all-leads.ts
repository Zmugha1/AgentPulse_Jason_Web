/**
 * One-time / on-demand rescore of all non-archived leads using scoreLead().
 * Run: npx tsx scripts/rescore-all-leads.ts
 */

import { setSupabaseClient } from '../src/lib/getSupabaseClient'
import { getScriptSupabase } from '../src/lib/scriptSupabase'
import { scoreLead } from '../src/services/scoringService'
import type { Lead, LeadStatus } from '../src/lib/types'

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, has_home_to_sell, buying_or_renting, lender_status, budget_max, listing_price, purpose, is_archived, created_at, updated_at'

const BATCH_SIZE = 100

type StatusCounts = Record<LeadStatus, number>

function emptyStatusCounts(): StatusCounts {
  return { hot: 0, warm: 0, cold: 0, dead: 0 }
}

async function fetchNonArchivedLeads(
  client: NonNullable<ReturnType<typeof getScriptSupabase>>,
): Promise<Lead[]> {
  const { data, error } = await client
    .from('leads')
    .select(LEAD_SELECT)
    .eq('is_archived', false)

  if (error) {
    throw new Error(`Failed to fetch leads: ${error.message}`)
  }

  return (data ?? []) as Lead[]
}

async function main(): Promise<void> {
  const client = getScriptSupabase()
  if (!client) {
    console.error(
      '[rescore-all-leads] Missing Supabase env. Set SUPABASE_SERVICE_ROLE_KEY and URL in .env.local',
    )
    process.exit(1)
  }

  setSupabaseClient(client)

  console.log('[rescore-all-leads] Fetching non-archived leads...')
  const leads = await fetchNonArchivedLeads(client)
  console.log(`[rescore-all-leads] Loaded ${leads.length} leads`)

  const statusCounts = emptyStatusCounts()
  let updated = 0
  let temperatureChanged = 0

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE)

    await Promise.all(
      batch.map(async (lead) => {
        const { score, status } = scoreLead(lead)
        statusCounts[status]++

        const prevScore = lead.score ?? 0
        const prevStatus = (lead.status ?? 'cold') as LeadStatus
        if (prevScore !== score || prevStatus !== status) {
          temperatureChanged++
        }

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
            `Update failed for lead ${lead.id} in batch ${batchNum}/${totalBatches}: ${error.message}`,
          )
        }

        updated++
      }),
    )

    console.log(
      `[rescore-all-leads] Batch ${batchNum}/${totalBatches}: updated ${batch.length} (total ${updated}/${leads.length})`,
    )
  }

  console.log('')
  console.log('[rescore-all-leads] Summary')
  console.log(`  Leads rescored: ${updated}`)
  console.log(`  Temperature changed: ${temperatureChanged}`)
  console.log(`  Hot:  ${statusCounts.hot}`)
  console.log(`  Warm: ${statusCounts.warm}`)
  console.log(`  Cold: ${statusCounts.cold}`)
  console.log(`  Dead: ${statusCounts.dead}`)
}

main().catch((err) => {
  console.error(
    '[rescore-all-leads] Failed:',
    err instanceof Error ? err.message : err,
  )
  process.exit(1)
})
