import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/types'

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, has_home_to_sell, buying_or_renting, lender_status, budget_max, listing_price, created_at, updated_at'

/**
 * Morning Brief worklist (desktop J-2c-fix, commit 20af9b2):
 * score DESC, then original_lead_date ASC (oldest opportunities first
 * within the same score band).
 */
export async function getMorningBriefLeads(limit = 50): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .order('score', { ascending: false, nullsFirst: false })
    .order('original_lead_date', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.error('[morningBriefService] getMorningBriefLeads:', error.message)
    throw new Error(`getMorningBriefLeads: ${error.message}`)
  }

  return (data ?? []) as Lead[]
}
