import type { Handler } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead, LeadStatus } from '../../src/lib/types'
import { scoreLead } from '../../src/services/scoringService'
import { getServiceSupabase } from './google-oauth-shared'

const LOG_MODULE = 'poll-website-forms'

const FORM_CHATBOT = 'chatbot-lead'
const FORM_VALUATION = 'seller-valuation'
const FORM_NEWSLETTER = 'newsletter-signup'

const TARGET_FORMS = new Set([
  FORM_CHATBOT,
  FORM_VALUATION,
  FORM_NEWSLETTER,
])

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

type SubmissionStatus =
  | 'imported'
  | 'skipped_duplicate_email'
  | 'skipped_invalid'
  | 'error'

type NetlifyForm = {
  id: string
  name: string
}

type NetlifySubmission = {
  id: string
  form_id?: string
  form_name?: string
  created_at: string
  data?: Record<string, unknown>
}

type LeadInsertRow = {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  zip: string | null
  source: string
  original_lead_date: string
  pipeline_stage: string
  score: number
  status: LeadStatus
  has_home_to_sell: boolean | null
  budget_max: number | null
  listing_price: number | null
  purpose: string | null
  is_archived: boolean
}

type PollSummary = {
  processed: number
  imported: number
  skipped_duplicate: number
  skipped_invalid: number
  errors: number
}

function safeLog(
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  console.log(JSON.stringify({ module: LOG_MODULE, event, ...fields }))
}

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function stringField(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key]
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

function splitName(name: unknown): {
  first_name: string | null
  last_name: string | null
} {
  const full = typeof name === 'string' ? name.trim() : ''
  if (!full) return { first_name: null, last_name: null }
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: null }
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

function parseBudgetMax(data: Record<string, unknown>): number | null {
  const value = data.budget
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  const raw = stringField(data, 'budget')
  if (!raw) return null
  const digits = raw.replace(/[^0-9.]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function composeChatbotPurpose(data: Record<string, unknown>): string {
  const area = stringField(data, 'area') ?? 'unknown area'
  const budget = stringField(data, 'budget') ?? 'unknown budget'
  const beds = stringField(data, 'beds') ?? 'unknown'
  const timeline = stringField(data, 'timeline') ?? 'unknown'
  return `Looking in ${area}, budget ${budget}, ${beds} beds, timeline ${timeline}`
}

function composeSellerPurpose(data: Record<string, unknown>): string {
  const propertyAddress = stringField(data, 'property_address') ?? 'unknown address'
  const city = stringField(data, 'city') ?? 'unknown city'
  const zip = stringField(data, 'zip') ?? 'unknown zip'
  const sqft = stringField(data, 'sqft') ?? 'unknown'
  const beds = stringField(data, 'beds') ?? 'unknown'
  const timeline = stringField(data, 'timeline') ?? 'unknown'
  return `Seller lead - ${propertyAddress}, ${city} ${zip}, ${sqft} sqft, ${beds} beds, timeline ${timeline}`
}

function toLeadForScoring(row: LeadInsertRow): Lead {
  return {
    id: 'pending',
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    zip: row.zip,
    source: row.source,
    original_lead_date: row.original_lead_date,
    last_contact_at: null,
    pipeline_stage: row.pipeline_stage,
    score: null,
    status: null,
    has_home_to_sell: row.has_home_to_sell,
    buying_or_renting: null,
    lender_status: null,
    budget_max: row.budget_max,
    listing_price: row.listing_price,
    purpose: row.purpose,
    is_archived: row.is_archived,
    created_at: null,
    updated_at: null,
  }
}

function applyScore(row: LeadInsertRow): LeadInsertRow {
  const { score, status } = scoreLead(toLeadForScoring(row))
  return { ...row, score, status }
}

function mapChatbotLead(
  data: Record<string, unknown>,
  createdAt: string,
): LeadInsertRow {
  const { first_name, last_name } = splitName(data.name)
  const base: LeadInsertRow = {
    first_name,
    last_name,
    email: stringField(data, 'email'),
    phone: stringField(data, 'phone'),
    address: null,
    zip: null,
    source: 'website_chatbot',
    original_lead_date: createdAt,
    pipeline_stage: 'new',
    score: 0,
    status: 'cold',
    has_home_to_sell: null,
    budget_max: parseBudgetMax(data),
    listing_price: null,
    purpose: composeChatbotPurpose(data),
    is_archived: false,
  }
  return applyScore(base)
}

function mapSellerLead(
  data: Record<string, unknown>,
  createdAt: string,
): LeadInsertRow {
  const { first_name, last_name } = splitName(data.name)
  const base: LeadInsertRow = {
    first_name,
    last_name,
    email: stringField(data, 'email'),
    phone: stringField(data, 'phone'),
    address: stringField(data, 'property_address'),
    zip: stringField(data, 'zip'),
    source: 'website_seller_valuation',
    original_lead_date: createdAt,
    pipeline_stage: 'new',
    score: 0,
    status: 'cold',
    has_home_to_sell: true,
    budget_max: null,
    listing_price: null,
    purpose: composeSellerPurpose(data),
    is_archived: false,
  }
  return applyScore(base)
}

function validateLeadFormFields(data: Record<string, unknown>): boolean {
  return Boolean(stringField(data, 'email') && stringField(data, 'name'))
}

function validateNewsletterFields(data: Record<string, unknown>): boolean {
  return Boolean(stringField(data, 'email'))
}

function isWithinImportWindow(createdAt: string): boolean {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  return Date.now() - created.getTime() <= THIRTY_DAYS_MS
}

async function netlifyFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Netlify API ${response.status} on ${path}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }

  return (await response.json()) as T
}

async function fetchSiteForms(
  siteId: string,
  token: string,
): Promise<NetlifyForm[]> {
  const forms = await netlifyFetch<NetlifyForm[]>(
    `/sites/${siteId}/forms`,
    token,
  )
  return forms.filter((form) => TARGET_FORMS.has(form.name))
}

async function fetchFormSubmissions(
  formId: string,
  token: string,
): Promise<NetlifySubmission[]> {
  const all: NetlifySubmission[] = []
  let page = 1

  while (true) {
    const batch = await netlifyFetch<NetlifySubmission[]>(
      `/forms/${formId}/submissions?per_page=100&page=${page}`,
      token,
    )
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    if (batch.length < 100) break
    page += 1
  }

  return all
}

async function submissionAlreadyImported(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('website_lead_submissions')
    .select('id')
    .eq('netlify_submission_id', submissionId)
    .maybeSingle()

  if (error) {
    throw new Error(`submission lookup failed: ${error.message}`)
  }

  return Boolean(data)
}

async function leadExistsForEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .ilike('email', normalized)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`lead duplicate lookup failed: ${error.message}`)
  }

  return Boolean(data)
}

async function recordSubmission(
  supabase: SupabaseClient,
  input: {
    netlify_submission_id: string
    netlify_form_name: string
    lead_id: string | null
    submission_created_at: string
    status: SubmissionStatus
    error_message?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('website_lead_submissions').insert({
    netlify_submission_id: input.netlify_submission_id,
    netlify_form_name: input.netlify_form_name,
    lead_id: input.lead_id,
    submission_created_at: input.submission_created_at,
    status: input.status,
    error_message: input.error_message ?? null,
  })

  if (error) {
    throw new Error(`submission record insert failed: ${error.message}`)
  }
}

async function processSubmission(
  supabase: SupabaseClient,
  formName: string,
  submission: NetlifySubmission,
  summary: PollSummary,
): Promise<void> {
  const submissionId = submission.id?.trim()
  const createdAt = submission.created_at?.trim()
  const data = submission.data ?? {}

  if (!submissionId || !createdAt) {
    summary.processed += 1
    summary.skipped_invalid += 1
    safeLog('submission_processed', {
      form_name: formName,
      status: 'skipped_invalid',
    })
    return
  }

  if (!isWithinImportWindow(createdAt)) {
    return
  }

  if (await submissionAlreadyImported(supabase, submissionId)) {
    return
  }

  summary.processed += 1

  try {
    if (formName === FORM_NEWSLETTER) {
      if (!validateNewsletterFields(data)) {
        await recordSubmission(supabase, {
          netlify_submission_id: submissionId,
          netlify_form_name: formName,
          lead_id: null,
          submission_created_at: createdAt,
          status: 'skipped_invalid',
        })
        summary.skipped_invalid += 1
        safeLog('submission_processed', {
          form_name: formName,
          status: 'skipped_invalid',
        })
        return
      }

      await recordSubmission(supabase, {
        netlify_submission_id: submissionId,
        netlify_form_name: formName,
        lead_id: null,
        submission_created_at: createdAt,
        status: 'imported',
      })
      summary.imported += 1
      safeLog('submission_processed', {
        form_name: formName,
        status: 'imported',
      })
      return
    }

    if (!validateLeadFormFields(data)) {
      await recordSubmission(supabase, {
        netlify_submission_id: submissionId,
        netlify_form_name: formName,
        lead_id: null,
        submission_created_at: createdAt,
        status: 'skipped_invalid',
      })
      summary.skipped_invalid += 1
      safeLog('submission_processed', {
        form_name: formName,
        status: 'skipped_invalid',
      })
      return
    }

    const email = stringField(data, 'email')!
    if (await leadExistsForEmail(supabase, email)) {
      await recordSubmission(supabase, {
        netlify_submission_id: submissionId,
        netlify_form_name: formName,
        lead_id: null,
        submission_created_at: createdAt,
        status: 'skipped_duplicate_email',
      })
      summary.skipped_duplicate += 1
      safeLog('submission_processed', {
        form_name: formName,
        status: 'skipped_duplicate_email',
      })
      return
    }

    const leadRow =
      formName === FORM_CHATBOT
        ? mapChatbotLead(data, createdAt)
        : mapSellerLead(data, createdAt)

    const { data: inserted, error: insertError } = await supabase
      .from('leads')
      .insert(leadRow)
      .select('id')
      .single()

    if (insertError || !inserted?.id) {
      throw new Error(insertError?.message ?? 'lead insert returned no id')
    }

    await recordSubmission(supabase, {
      netlify_submission_id: submissionId,
      netlify_form_name: formName,
      lead_id: inserted.id,
      submission_created_at: createdAt,
      status: 'imported',
    })

    summary.imported += 1
    safeLog('submission_processed', {
      form_name: formName,
      status: 'imported',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    try {
      await recordSubmission(supabase, {
        netlify_submission_id: submissionId,
        netlify_form_name: formName,
        lead_id: null,
        submission_created_at: createdAt,
        status: 'error',
        error_message: message,
      })
    } catch (recordErr) {
      const recordMessage =
        recordErr instanceof Error ? recordErr.message : 'unknown error'
      safeLog('submission_record_failed', {
        form_name: formName,
        reason: recordMessage.slice(0, 120),
      })
    }
    summary.errors += 1
    safeLog('submission_processed', {
      form_name: formName,
      status: 'error',
    })
  }
}

export const handler: Handler = async () => {
  const summary: PollSummary = {
    processed: 0,
    imported: 0,
    skipped_duplicate: 0,
    skipped_invalid: 0,
    errors: 0,
  }

  safeLog('poll_started', { timestamp: new Date().toISOString() })

  try {
    const token = requireEnv('NETLIFY_PERSONAL_ACCESS_TOKEN')
    const siteId = requireEnv('WEBSITE_NETLIFY_SITE_ID')
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    requireEnv('VITE_SUPABASE_URL')

    const supabase = getServiceSupabase()
    const forms = await fetchSiteForms(siteId, token)
    safeLog('forms_fetched', { count: forms.length })

    for (const form of forms) {
      const submissions = await fetchFormSubmissions(form.id, token)
      for (const submission of submissions) {
        await processSubmission(supabase, form.name, submission, summary)
      }
    }

    safeLog('poll_completed', {
      processed: summary.processed,
      imported: summary.imported,
      skipped_duplicate: summary.skipped_duplicate,
      skipped_invalid: summary.skipped_invalid,
      errors: summary.errors,
    })

    return json(200, summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    safeLog('poll_failed', { reason: message.slice(0, 200) })
    return json(500, { error: 'Poll failed', summary })
  }
}
