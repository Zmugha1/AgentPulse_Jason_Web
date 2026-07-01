import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/types'

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, has_home_to_sell, buying_or_renting, lender_status, budget_max, listing_price, purpose, is_archived, created_at, updated_at, status_override'

function recencyCutoffIso(months: number): string {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return cutoff.toISOString()
}

/**
 * Morning Brief worklist (desktop J-2c-fix, commit 20af9b2):
 * score DESC, then original_lead_date ASC (oldest opportunities first
 * within the same score band).
 *
 * @param limit Max rows to return
 * @param recencyMonths When set, only leads with original_lead_date within
 *   the last N months. Pass null to include all history.
 */
export async function getMorningBriefLeads(
  limit = 50,
  recencyMonths: number | null = 12,
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('is_archived', false)
    .or(
      'last_contact_at.is.null,last_contact_at.lt.' +
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    )
    .order('score', { ascending: false, nullsFirst: false })
    .order('original_lead_date', { ascending: true, nullsFirst: false })

  if (recencyMonths !== null) {
    query = query.gte('original_lead_date', recencyCutoffIso(recencyMonths))
  }

  const { data, error } = await query.limit(limit)

  if (error) {
    console.error('[morningBriefService] getMorningBriefLeads:', error.message)
    throw new Error(`getMorningBriefLeads: ${error.message}`)
  }

  return (data ?? []) as Lead[]
}
