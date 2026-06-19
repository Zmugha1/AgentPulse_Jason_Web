import type { Handler } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '../../src/lib/googleTokenRefresh'
import type { Lead, LeadStatus } from '../../src/lib/types'
import { scoreLead } from '../../src/services/scoringService'
import { getServiceSupabase } from './google-oauth-shared'

const LOG_MODULE = 'scan-gmail-leads'

const GMAIL_LIST_QUERY = 'from:leads@email.realtor.com'

const REALTOR_FROMS = new Set(['leads@email.realtor.com'])

const REALTOR_SUBJECT_PATTERNS = [/new realtor\.com lead/i, /new lead/i, /contacted you about/i]

export type GmailLeadSource = 'realtor.com'

export type ParsedGmailLead = {
  source: GmailLeadSource
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  purpose: string | null
  budget_max: number | null
  original_lead_date: string
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

type ScanSummary = {
  users_scanned: number
  messages_seen: number
  messages_processed: number
  leads_created: number
  skipped_duplicate: number
  skipped_parse: number
  skipped_subject: number
  errors: number
  needs_reconnect: number
}

type GmailHeader = { name?: string; value?: string }

type GmailMessagePart = {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: GmailMessagePart[]
}

type GmailMessage = {
  id?: string
  internalDate?: string
  payload?: GmailMessagePart & { headers?: GmailHeader[] }
}

type GmailListResponse = {
  messages?: Array<{ id?: string }>
  error?: { message?: string; code?: number }
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

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const target = name.toLowerCase()
  const found = headers?.find((h) => h.name?.toLowerCase() === target)
  return found?.value?.trim() ?? ''
}

function parseFromEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/)
  const raw = (match?.[1] ?? fromHeader).trim().toLowerCase()
  return raw
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function extractBodyText(payload: GmailMessagePart | undefined): string {
  if (!payload) return ''

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data)
    if (payload.mimeType?.includes('html')) {
      return stripHtml(decoded)
    }
    return decoded
  }

  if (payload.parts?.length) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (plain?.body?.data) {
      return decodeBase64Url(plain.body.data)
    }
    const html = payload.parts.find((p) => p.mimeType === 'text/html')
    if (html?.body?.data) {
      return stripHtml(decodeBase64Url(html.body.data))
    }
    for (const part of payload.parts) {
      const nested = extractBodyText(part)
      if (nested.trim()) return nested
    }
  }

  return ''
}

function splitName(full: string | null): {
  first_name: string | null
  last_name: string | null
} {
  const trimmed = full?.trim() ?? ''
  if (!trimmed) return { first_name: null, last_name: null }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: null }
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

function extractEmail(text: string): string | null {
  const match = text.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  )
  return match?.[0]?.trim().toLowerCase() ?? null
}

function extractPhone(text: string): string | null {
  const labeled =
    text.match(/(?:phone|tel|mobile|cell)\s*[:#]?\s*([+\d().\-\s]{10,})/i)?.[1]
  const candidate = labeled ?? text.match(/(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/)?.[1]
  if (!candidate) return null
  const digits = candidate.replace(/\D/g, '')
  if (digits.length < 10) return null
  return candidate.trim()
}

function extractLabeledField(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:#]\\s*(.+?)(?:\\n|$)`, 'i')
    const match = text.match(re)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return null
}

function extractZip(text: string): string | null {
  const match = text.match(/\b(\d{5})(?:-\d{4})?\b/)
  return match?.[1] ?? null
}

export function classifyGmailLeadSource(
  fromHeader: string,
  subject: string,
): GmailLeadSource | null {
  const from = parseFromEmail(fromHeader)
  if (REALTOR_FROMS.has(from)) {
    if (REALTOR_SUBJECT_PATTERNS.some((re) => re.test(subject))) {
      return 'realtor.com'
    }
    return null
  }
  return null
}

export function parseRealtorLeadEmail(input: {
  subject: string
  body: string
  receivedAt: string
}): ParsedGmailLead | null {
  const { subject, body, receivedAt } = input
  const text = body.replace(/\r\n/g, '\n')

  let original_lead_date = receivedAt
  const dateMatch = text.match(
    /([A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm))/i,
  )
  if (dateMatch) {
    const parsed = new Date(dateMatch[1])
    if (!Number.isNaN(parsed.getTime())) {
      original_lead_date = parsed.toISOString()
    }
  }

  const first_name =
    text.match(/^Name\s+(.+)$/im)?.[1]?.trim() ??
    subject.match(/new realtor\.com lead\s*[-–]\s*(.+)$/i)?.[1]?.trim() ??
    null

  const purposeMatch = text.match(
    /(?:am|pm)\s*\n\s*["']?(.+?)["']?\s*\n\s*Name\s+/is,
  )
  const purpose = purposeMatch?.[1]?.trim() ?? null

  const phoneLine = text.match(/\n(\d{3}-\d{3}-\d{4})\s*\n/i)?.[1]
  const phone = phoneLine ?? extractPhone(text)

  const email = extractEmail(text)

  const addressMatch = text.match(
    /MLS ID\s*#\d+\s*\n\s*(.+?)\s*\n\s*\$[\d,]+/is,
  )
  const address = addressMatch?.[1]?.trim() ?? null

  let budget_max: number | null = null
  const priceMatch = text.match(/\$([\d,]+)/)
  if (priceMatch) {
    const parsed = Number(priceMatch[1].replace(/,/g, ''))
    budget_max = Number.isFinite(parsed) ? parsed : null
  }

  if (!first_name && !email && !phone) {
    return null
  }

  return {
    source: 'realtor.com',
    first_name,
    last_name: null,
    email,
    phone,
    address,
    purpose,
    budget_max,
    original_lead_date,
  }
}

export function parseGmailLeadNotification(input: {
  fromHeader: string
  subject: string
  body: string
  receivedAt: string
}): ParsedGmailLead | null {
  const source = classifyGmailLeadSource(input.fromHeader, input.subject)
  if (source === 'realtor.com') {
    return parseRealtorLeadEmail(input)
  }
  return null
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

function mapParsedLead(parsed: ParsedGmailLead): LeadInsertRow {
  const base: LeadInsertRow = {
    first_name: parsed.first_name,
    last_name: parsed.last_name,
    email: parsed.email,
    phone: parsed.phone,
    address: parsed.address,
    zip: parsed.address ? extractZip(parsed.address) : null,
    source: parsed.source,
    original_lead_date: parsed.original_lead_date,
    pipeline_stage: 'new',
    score: 0,
    status: 'cold',
    has_home_to_sell: null,
    budget_max: parsed.budget_max,
    listing_price: null,
    purpose: parsed.purpose,
    is_archived: false,
  }
  const { score, status } = scoreLead(toLeadForScoring(base))
  return { ...base, score, status }
}

async function fetchConnectedUserEmails(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('user_email')

  if (error) {
    throw new Error(`google_oauth_tokens lookup failed: ${error.message}`)
  }

  const emails = new Set<string>()
  for (const row of data ?? []) {
    const email = (row as { user_email?: string }).user_email?.trim().toLowerCase()
    if (email) emails.add(email)
  }
  return [...emails]
}

async function loadProcessedMessageIds(
  supabase: SupabaseClient,
  messageIds: string[],
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set()

  const { data, error } = await supabase
    .from('gmail_processed_messages')
    .select('message_id')
    .in('message_id', messageIds)

  if (error) {
    throw new Error(`gmail_processed_messages lookup failed: ${error.message}`)
  }

  return new Set(
    (data ?? [])
      .map((row) => (row as { message_id?: string }).message_id)
      .filter((id): id is string => Boolean(id)),
  )
}

async function markMessageProcessed(
  supabase: SupabaseClient,
  messageId: string,
  input: { lead_created: boolean; skip_reason?: string | null },
): Promise<void> {
  const { error } = await supabase.from('gmail_processed_messages').insert({
    message_id: messageId,
    lead_created: input.lead_created,
    skip_reason: input.skip_reason ?? null,
  })

  if (error) {
    throw new Error(`gmail_processed_messages insert failed: ${error.message}`)
  }
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
    throw new Error(`lead duplicate email lookup failed: ${error.message}`)
  }

  return Boolean(data)
}

async function leadExistsForPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return false
  const lastTen = digits.slice(-10)

  const { data, error } = await supabase
    .from('leads')
    .select('id, phone')
    .not('phone', 'is', null)
    .limit(500)

  if (error) {
    throw new Error(`lead duplicate phone lookup failed: ${error.message}`)
  }

  for (const row of data ?? []) {
    const existing = (row as { phone?: string | null }).phone
    if (!existing) continue
    if (existing.replace(/\D/g, '').slice(-10) === lastTen) {
      return true
    }
  }

  return false
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  let data: T
  try {
    data = (await response.json()) as T
  } catch {
    data = {} as T
  }

  return { ok: response.ok, status: response.status, data }
}

async function listInboxMessages(accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({
    q: GMAIL_LIST_QUERY,
    maxResults: '50',
    labelIds: 'INBOX',
  })

  const result = await gmailFetch<GmailListResponse>(
    accessToken,
    `/messages?${params.toString()}`,
  )

  if (!result.ok) {
    const err = new Error(
      `Gmail messages.list failed with status ${result.status}`,
    ) as Error & { status?: number }
    err.status = result.status
    throw err
  }

  return (
    result.data.messages
      ?.map((m) => m.id?.trim())
      .filter((id): id is string => Boolean(id)) ?? []
  )
}

async function getGmailMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage | null> {
  const result = await gmailFetch<GmailMessage>(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}?format=full`,
  )

  if (!result.ok) {
    const err = new Error(
      `Gmail messages.get failed with status ${result.status}`,
    ) as Error & { status?: number }
    err.status = result.status
    throw err
  }

  return result.data
}

function messageReceivedAt(message: GmailMessage): string {
  if (message.internalDate) {
    const ms = Number(message.internalDate)
    if (!Number.isNaN(ms) && ms > 0) {
      return new Date(ms).toISOString()
    }
  }
  return new Date().toISOString()
}

async function processMessageForUser(
  supabase: SupabaseClient,
  accessToken: string,
  messageId: string,
  summary: ScanSummary,
): Promise<void> {
  let message: GmailMessage | null
  try {
    message = await getGmailMessage(accessToken, messageId)
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401) {
      throw err
    }
    summary.errors += 1
    safeLog('message_fetch_failed', { message_id: messageId })
    return
  }

  if (!message?.payload) {
    summary.skipped_parse += 1
    await markMessageProcessed(supabase, messageId, {
      lead_created: false,
      skip_reason: 'missing_payload',
    })
    return
  }

  const headers = message.payload.headers
  const fromHeader = headerValue(headers, 'From')
  const subject = headerValue(headers, 'Subject')
  const body = extractBodyText(message.payload)
  const receivedAt = messageReceivedAt(message)

  const source = classifyGmailLeadSource(fromHeader, subject)
  if (!source) {
    summary.skipped_subject += 1
    await markMessageProcessed(supabase, messageId, {
      lead_created: false,
      skip_reason: 'subject_or_sender_mismatch',
    })
    return
  }

  const parsed = parseGmailLeadNotification({
    fromHeader,
    subject,
    body,
    receivedAt,
  })

  if (!parsed) {
    summary.skipped_parse += 1
    safeLog('parse_warning', {
      message_id: messageId,
      source,
      reason: 'parse_failed',
    })
    await markMessageProcessed(supabase, messageId, {
      lead_created: false,
      skip_reason: 'parse_failed',
    })
    return
  }

  if (parsed.email && (await leadExistsForEmail(supabase, parsed.email))) {
    summary.skipped_duplicate += 1
    await markMessageProcessed(supabase, messageId, {
      lead_created: false,
      skip_reason: 'duplicate_email',
    })
    return
  }

  if (parsed.phone && (await leadExistsForPhone(supabase, parsed.phone))) {
    summary.skipped_duplicate += 1
    await markMessageProcessed(supabase, messageId, {
      lead_created: false,
      skip_reason: 'duplicate_phone',
    })
    return
  }

  const leadRow = mapParsedLead(parsed)
  const { error: insertError } = await supabase.from('leads').insert(leadRow)

  if (insertError) {
    summary.errors += 1
    safeLog('lead_insert_failed', {
      message_id: messageId,
      reason: insertError.message.slice(0, 120),
    })
    return
  }

  summary.leads_created += 1
  await markMessageProcessed(supabase, messageId, {
    lead_created: true,
    skip_reason: null,
  })
  safeLog('lead_created', {
    message_id: messageId,
    source: parsed.source,
  })
}

async function scanUserInbox(
  supabase: SupabaseClient,
  userEmail: string,
  summary: ScanSummary,
): Promise<void> {
  summary.users_scanned += 1

  const tokenResult = await getValidAccessToken(userEmail)
  if (!tokenResult.ok) {
    if (tokenResult.needs_reconnect) {
      summary.needs_reconnect += 1
      safeLog('token_needs_reconnect', { user_email: userEmail })
    } else {
      safeLog('token_unavailable', {
        user_email: userEmail,
        reason: tokenResult.code,
      })
    }
    return
  }

  let messageIds: string[]
  try {
    messageIds = await listInboxMessages(tokenResult.accessToken)
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401) {
      summary.needs_reconnect += 1
      safeLog('token_needs_reconnect', {
        user_email: userEmail,
        reason: 'gmail_list_401',
      })
      return
    }
    summary.errors += 1
    safeLog('gmail_list_failed', {
      user_email: userEmail,
      reason: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    })
    return
  }

  summary.messages_seen += messageIds.length
  if (messageIds.length === 0) return

  const processed = await loadProcessedMessageIds(supabase, messageIds)
  const pending = messageIds.filter((id) => !processed.has(id))

  for (const messageId of pending) {
    summary.messages_processed += 1
    try {
      await processMessageForUser(
        supabase,
        tokenResult.accessToken,
        messageId,
        summary,
      )
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 401) {
        summary.needs_reconnect += 1
        safeLog('token_needs_reconnect', {
          user_email: userEmail,
          reason: 'gmail_get_401',
        })
        return
      }
      summary.errors += 1
      safeLog('message_process_error', {
        user_email: userEmail,
        message_id: messageId,
      })
    }
  }
}

export const handler: Handler = async () => {
  const summary: ScanSummary = {
    users_scanned: 0,
    messages_seen: 0,
    messages_processed: 0,
    leads_created: 0,
    skipped_duplicate: 0,
    skipped_parse: 0,
    skipped_subject: 0,
    errors: 0,
    needs_reconnect: 0,
  }

  safeLog('scan_started', { timestamp: new Date().toISOString() })

  try {
    const supabase = getServiceSupabase()
    const users = await fetchConnectedUserEmails(supabase)
    safeLog('users_loaded', { count: users.length })

    for (const userEmail of users) {
      await scanUserInbox(supabase, userEmail, summary)
    }

    safeLog('scan_completed', summary)
    return json(200, summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    safeLog('scan_failed', { reason: message.slice(0, 200) })
    return json(500, { error: 'Gmail scan failed', summary })
  }
}
