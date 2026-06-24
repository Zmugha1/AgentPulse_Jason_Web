import { supabase } from '../lib/supabase'
import type { AddLeadInput, Lead } from '../lib/types'
import { scoreLead } from './scoringService'

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, has_home_to_sell, buying_or_renting, lender_status, budget_max, listing_price, purpose, is_archived, created_at, updated_at, status_override'

const PURPOSE_MAX_LENGTH = 200

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizePhone(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value ?? null)
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10) {
    throw new Error('addLead: phone must contain at least 10 digits')
  }
  return trimmed
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value ?? null)
  if (!trimmed) return null
  if (!trimmed.includes('@')) {
    throw new Error('addLead: email must include @')
  }
  return trimmed
}

function normalizeZip(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value ?? null)
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length !== 5) {
    throw new Error('addLead: zip must be 5 digits')
  }
  return digits
}

function normalizeLeadDate(value: string | null | undefined): string {
  if (value?.trim()) {
    const parsed = new Date(`${value.trim()}T12:00:00`)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return today.toISOString()
}

function normalizePurpose(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > PURPOSE_MAX_LENGTH
    ? trimmed.slice(0, PURPOSE_MAX_LENGTH)
    : trimmed
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) {
    console.error(`[leadsService] ${context}:`, error.message)
    throw new Error(`${context}: ${error.message}`)
  }
}

function applyArchiveFilter<T extends { eq: (col: string, val: boolean) => T }>(
  query: T,
  includeArchived: boolean,
): T {
  if (!includeArchived) {
    return query.eq('is_archived', false)
  }
  return query
}

/**
 * Fetch leads in the curated archive. By default excludes archived rows.
 */
export async function getAllLeads(
  includeArchived = false,
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select(LEAD_SELECT)
    .order('original_lead_date', { ascending: true, nullsFirst: false })

  query = applyArchiveFilter(query, includeArchived)

  const { data, error } = await query

  assertNoError(error, 'getAllLeads')
  return (data ?? []) as Lead[]
}

/**
 * Fetch leads whose `pipeline_stage` matches the given stage value.
 */
export async function getLeadsByStage(
  stage: string,
  includeArchived = false,
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('pipeline_stage', stage)
    .order('original_lead_date', { ascending: true, nullsFirst: false })

  query = applyArchiveFilter(query, includeArchived)

  const { data, error } = await query

  assertNoError(error, 'getLeadsByStage')
  return (data ?? []) as Lead[]
}

/**
 * Fetch a single lead by primary key. Returns archived leads (direct lookup).
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
 * Return the number of rows in `leads`. When includeArchived is false, counts
 * only the active (non-archived) pool.
 */
export async function getLeadsCount(
  includeArchived = true,
): Promise<number> {
  let query = supabase.from('leads').select('*', { count: 'exact', head: true })
  query = applyArchiveFilter(query, includeArchived)

  const { count, error } = await query

  assertNoError(error, 'getLeadsCount')
  return count ?? 0
}

/**
 * Find leads whose email matches any of the given addresses (case-insensitive).
 */
export async function findLeadsByEmails(emails: string[]): Promise<Lead[]> {
  const normalized = [
    ...new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  ]

  if (normalized.length === 0) {
    return []
  }

  const orFilter = normalized
    .map((email) => `email.ilike.${email}`)
    .join(',')

  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .or(orFilter)

  assertNoError(error, 'findLeadsByEmails')
  return (data ?? []) as Lead[]
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
 * Manually add a lead (walk-in, referral, networking). Scores on insert.
 */
export async function addLead(input: AddLeadInput): Promise<Lead> {
  const firstName = normalizeOptionalText(input.first_name)
  const lastName = normalizeOptionalText(input.last_name)
  if (!firstName || !lastName) {
    throw new Error('addLead: first name and last name are required')
  }

  const now = new Date().toISOString()
  const pipelineStage = normalizeOptionalText(input.pipeline_stage ?? 'new') ?? 'new'
  const draftForScoring: Lead = {
    id: '00000000-0000-0000-0000-000000000000',
    first_name: firstName,
    last_name: lastName,
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    address: normalizeOptionalText(input.address ?? null),
    zip: normalizeZip(input.zip),
    source: 'manual',
    original_lead_date: normalizeLeadDate(input.original_lead_date),
    last_contact_at: null,
    pipeline_stage: pipelineStage,
    score: null,
    status: null,
    has_home_to_sell: input.has_home_to_sell ?? false,
    buying_or_renting: null,
    lender_status: null,
    budget_max: input.budget_max ?? null,
    listing_price: null,
    purpose: normalizePurpose(input.purpose ?? null),
    is_archived: false,
    created_at: now,
    updated_at: now,
  }

  const { score, status } = scoreLead(draftForScoring)

  const { data, error } = await supabase
    .from('leads')
    .insert({
      first_name: draftForScoring.first_name,
      last_name: draftForScoring.last_name,
      email: draftForScoring.email,
      phone: draftForScoring.phone,
      address: draftForScoring.address,
      zip: draftForScoring.zip,
      source: 'manual',
      original_lead_date: draftForScoring.original_lead_date,
      last_contact_at: null,
      pipeline_stage: pipelineStage,
      score,
      status,
      has_home_to_sell: draftForScoring.has_home_to_sell,
      budget_max: draftForScoring.budget_max,
      listing_price: null,
      purpose: draftForScoring.purpose,
      is_archived: false,
      created_at: now,
      updated_at: now,
    })
    .select(LEAD_SELECT)
    .single()

  assertNoError(error, 'addLead')
  if (!data) {
    throw new Error('addLead: no lead returned after insert')
  }
  return data as Lead
}

/**
 * Hide a lead from daily views without deleting the record.
 */
export async function archiveLead(leadId: string): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({
      is_archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select(LEAD_SELECT)
    .single()

  assertNoError(error, 'archiveLead')
  if (!data) {
    throw new Error(`archiveLead: no lead returned for id ${leadId}`)
  }
  return data as Lead
}

/**
 * Restore an archived lead to the default active views.
 */
export async function unarchiveLead(leadId: string): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({
      is_archived: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select(LEAD_SELECT)
    .single()

  assertNoError(error, 'unarchiveLead')
  if (!data) {
    throw new Error(`unarchiveLead: no lead returned for id ${leadId}`)
  }
  return data as Lead
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

/**
 * Set or clear a lead's purpose (Jason's "what were they looking for").
 * Empty or whitespace-only strings are stored as null. Truncates to 200 chars.
 */
export async function updateLeadPurpose(
  leadId: string,
  purpose: string | null,
): Promise<Lead> {
  const normalized = normalizePurpose(purpose)
  const { data, error } = await supabase
    .from('leads')
    .update({
      purpose: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select(LEAD_SELECT)
    .single()

  assertNoError(error, 'updateLeadPurpose')
  if (!data) {
    throw new Error(`updateLeadPurpose: no lead returned for id ${leadId}`)
  }
  return data as Lead
}
