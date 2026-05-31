import { supabase } from '../lib/supabase'
import type { Lead } from '../lib/types'

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, has_home_to_sell, buying_or_renting, lender_status, budget_max, listing_price, created_at, updated_at'

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) {
    console.error(`[leadsService] ${context}:`, error.message)
    throw new Error(`${context}: ${error.message}`)
  }
}

/**
 * Fetch every lead in the curated archive (all rows in `leads`).
 */
export async function getAllLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .order('original_lead_date', { ascending: true, nullsFirst: false })

  assertNoError(error, 'getAllLeads')
  return (data ?? []) as Lead[]
}

/**
 * Fetch leads whose `pipeline_stage` matches the given stage value.
 */
export async function getLeadsByStage(stage: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('pipeline_stage', stage)
    .order('original_lead_date', { ascending: true, nullsFirst: false })

  assertNoError(error, 'getLeadsByStage')
  return (data ?? []) as Lead[]
}

/**
 * Fetch a single lead by primary key. Throws if the id is not found.
 */
export async function getLeadById(id: string): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('id', id)
    .maybeSingle()

  assertNoError(error, 'getLeadById')
  if (!data) {
    throw new Error(`getLeadById: no lead found for id ${id}`)
  }
  return data as Lead
}

/**
 * Return the total number of rows in `leads`.
 */
export async function getLeadsCount(): Promise<number> {
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  assertNoError(error, 'getLeadsCount')
  return count ?? 0
}

/**
 * Fetch leads from a single import source (e.g. zillow, realtor_com_full).
 */
export async function getLeadsBySource(source: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('source', source)
    .order('original_lead_date', { ascending: true, nullsFirst: false })

  assertNoError(error, 'getLeadsBySource')
  return (data ?? []) as Lead[]
}

/**
 * Update a lead's pipeline stage and bump `updated_at`.
 */
export async function updateLeadStage(id: string, stage: string): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      pipeline_stage: stage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  assertNoError(error, 'updateLeadStage')
}

/**
 * Update a lead's score status label (hot / warm / cold) and bump `updated_at`.
 */
export async function updateLeadStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  assertNoError(error, 'updateLeadStatus')
}
