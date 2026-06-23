import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getValidAccessToken } from '../../src/lib/googleTokenRefresh'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'enrich-lead'
const RESEARCH_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1500

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, purpose'

const PEOPLE_CONNECTIONS_URL =
  'https://people.googleapis.com/v1/people/me/connections'

const SYSTEM_PROMPT = [
  'You are a real estate agent assistant.',
  'Research this lead and find publicly available information that would help a realtor prepare for a call.',
  'Focus on: current home ownership, estimated equity, employment, life signals suggesting a move.',
  'Be factual. If you cannot find information, say so clearly.',
  'Never invent or guess details.',
  'Never use em dashes in your output. Use commas or periods instead.',
].join(' ')

type EnrichLeadRequestBody = {
  lead_id?: unknown
  user_email?: unknown
}

type LeadRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  zip: string | null
  source: string | null
  purpose: string | null
}

export type GoogleContactMatch = {
  name: string | null
  organization: string | null
  job_title: string | null
  addresses: string[]
  notes: string | null
}

export type GoogleContactsStatus =
  | 'found'
  | 'not_found'
  | 'not_connected'
  | 'scope_missing'
  | 'error'

export type WebResearchResult = {
  owns_home: boolean | null
  current_address: string | null
  estimated_value: string | null
  estimated_equity: string | null
  years_at_address: string | null
  employer: string | null
  linkedin_url: string | null
  life_signals: string | null
  summary: string
}

type GooglePerson = {
  names?: Array<{ displayName?: string }>
  emailAddresses?: Array<{ value?: string }>
  phoneNumbers?: Array<{ value?: string }>
  organizations?: Array<{ name?: string; title?: string }>
  addresses?: Array<{ formattedValue?: string }>
  biographies?: Array<{ value?: string }>
}

type GoogleConnectionsResponse = {
  connections?: GooglePerson[]
  nextPageToken?: string
  error?: { message?: string; status?: string }
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function parseRequestBody(raw: string | null): EnrichLeadRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as EnrichLeadRequestBody
  } catch {
    return null
  }
}

function requireLeadId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function requireEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-10)
}

function phonesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const na = normalizePhoneDigits(a)
  const nb = normalizePhoneDigits(b)
  return na.length >= 10 && nb.length >= 10 && na === nb
}

function emailsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return normalizeEmail(a) === normalizeEmail(b)
}

function extractCityFromAddress(address: string | null): string {
  if (!address?.trim()) return 'unknown'
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return parts[parts.length - 2] ?? parts[parts.length - 1] ?? address.trim()
  }
  return address.trim()
}

function mapGooglePersonToContact(person: GooglePerson): GoogleContactMatch {
  const name =
    person.names?.map((n) => n.displayName?.trim()).find(Boolean) ?? null
  const org = person.organizations?.[0]
  const organization = org?.name?.trim() || null
  const job_title = org?.title?.trim() || null
  const addresses =
    person.addresses
      ?.map((a) => a.formattedValue?.trim())
      .filter((v): v is string => Boolean(v)) ?? []
  const notes =
    person.biographies?.map((b) => b.value?.trim()).find(Boolean) ?? null

  return { name, organization, job_title, addresses, notes }
}

function findMatchingContact(
  connections: GooglePerson[],
  lead: LeadRow,
): GooglePerson | null {
  for (const person of connections) {
    const emails =
      person.emailAddresses
        ?.map((e) => e.value?.trim())
        .filter((v): v is string => Boolean(v)) ?? []
    for (const email of emails) {
      if (emailsMatch(email, lead.email)) {
        return person
      }
    }

    const phones =
      person.phoneNumbers
        ?.map((p) => p.value?.trim())
        .filter((v): v is string => Boolean(v)) ?? []
    for (const phone of phones) {
      if (phonesMatch(phone, lead.phone)) {
        return person
      }
    }
  }
  return null
}

async function fetchGoogleConnections(
  accessToken: string,
): Promise<{ connections: GooglePerson[]; scopeMissing: boolean }> {
  const params = new URLSearchParams({
    personFields:
      'names,emailAddresses,phoneNumbers,organizations,addresses,biographies',
    pageSize: '1000',
  })

  const res = await fetch(`${PEOPLE_CONNECTIONS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 403) {
    safeLog('google_people_forbidden', { note: 'contacts_readonly_scope_missing' })
    return { connections: [], scopeMissing: true }
  }

  if (!res.ok) {
    safeLog('google_people_error', { status: res.status })
    throw new Error(`Google People API returned ${res.status}`)
  }

  const payload = (await res.json()) as GoogleConnectionsResponse
  return {
    connections: payload.connections ?? [],
    scopeMissing: false,
  }
}

async function runGoogleContactsJob(
  userEmail: string,
  lead: LeadRow,
): Promise<{ contact: GoogleContactMatch | null; status: GoogleContactsStatus }> {
  const tokenResult = await getValidAccessToken(userEmail)
  if (!tokenResult.ok) {
    safeLog('google_token_unavailable', { reason: tokenResult.code })
    return { contact: null, status: 'not_connected' }
  }

  try {
    const { connections, scopeMissing } = await fetchGoogleConnections(
      tokenResult.accessToken,
    )
    if (scopeMissing) {
      return { contact: null, status: 'scope_missing' }
    }

    const match = findMatchingContact(connections, lead)
    if (!match) {
      return { contact: null, status: 'not_found' }
    }

    return { contact: mapGooglePersonToContact(match), status: 'found' }
  } catch {
    safeLog('google_contacts_job_failed')
    return { contact: null, status: 'error' }
  }
}

function buildWebResearchUserPrompt(lead: LeadRow): string {
  const name =
    `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || 'Unknown'
  const city = extractCityFromAddress(lead.address)

  return [
    'Research this real estate lead:',
    `Name: ${name}`,
    `Phone: ${lead.phone ?? 'unknown'}`,
    `Email: ${lead.email ?? 'unknown'}`,
    `City/area: ${city}`,
    `Property interest: ${lead.purpose ?? 'unknown'}`,
    '',
    'Find:',
    '1. Do they currently own a home? If yes, what is the address and estimated value?',
    '2. How long have they likely lived there?',
    '3. Estimated equity position',
    '4. Current employer or job title',
    '5. LinkedIn URL if found',
    '6. Any life signals suggesting they are ready to move',
    '',
    'Return JSON only, no markdown:',
    '{',
    '  "owns_home": boolean | null,',
    '  "current_address": string | null,',
    '  "estimated_value": string | null,',
    '  "estimated_equity": string | null,',
    '  "years_at_address": string | null,',
    '  "employer": string | null,',
    '  "linkedin_url": string | null,',
    '  "life_signals": string | null,',
    '  "summary": string',
    '}',
  ].join('\n')
}

function extractTextFromMessage(content: Anthropic.Messages.ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

function tryParseWebResearchJson(text: string): Partial<WebResearchResult> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as Partial<WebResearchResult>
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as Partial<WebResearchResult>
    } catch {
      return null
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Partial<WebResearchResult>
    } catch {
      return null
    }
  }
  return null
}

function emptyWebResearch(summary: string): WebResearchResult {
  return {
    owns_home: null,
    current_address: null,
    estimated_value: null,
    estimated_equity: null,
    years_at_address: null,
    employer: null,
    linkedin_url: null,
    life_signals: null,
    summary,
  }
}

function normalizeWebResearch(
  parsed: Partial<WebResearchResult> | null,
  rawText: string,
): WebResearchResult {
  if (!parsed) {
    return emptyWebResearch(rawText || 'No web research results could be parsed.')
  }

  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : rawText || 'No summary available.'

  return {
    owns_home:
      typeof parsed.owns_home === 'boolean' ? parsed.owns_home : null,
    current_address:
      typeof parsed.current_address === 'string' && parsed.current_address.trim()
        ? parsed.current_address.trim()
        : null,
    estimated_value:
      typeof parsed.estimated_value === 'string' && parsed.estimated_value.trim()
        ? parsed.estimated_value.trim()
        : null,
    estimated_equity:
      typeof parsed.estimated_equity === 'string' && parsed.estimated_equity.trim()
        ? parsed.estimated_equity.trim()
        : null,
    years_at_address:
      typeof parsed.years_at_address === 'string' && parsed.years_at_address.trim()
        ? parsed.years_at_address.trim()
        : null,
    employer:
      typeof parsed.employer === 'string' && parsed.employer.trim()
        ? parsed.employer.trim()
        : null,
    linkedin_url:
      typeof parsed.linkedin_url === 'string' && parsed.linkedin_url.trim()
        ? parsed.linkedin_url.trim()
        : null,
    life_signals:
      typeof parsed.life_signals === 'string' && parsed.life_signals.trim()
        ? parsed.life_signals.trim()
        : null,
    summary,
  }
}

async function runWebResearchJob(lead: LeadRow): Promise<WebResearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    safeLog('anthropic_key_missing')
    return emptyWebResearch('Web research unavailable')
  }

  const client = new Anthropic({ apiKey })
  const userPrompt = buildWebResearchUserPrompt(lead)

  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
    })
  } catch (err) {
    safeLog('anthropic_call_failed', {
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    })
    return emptyWebResearch('Web research unavailable')
  }

  const rawText = extractTextFromMessage(response.content)
  try {
    const parsed = tryParseWebResearchJson(rawText)
    return normalizeWebResearch(parsed, rawText)
  } catch {
    return emptyWebResearch(rawText || 'Web research unavailable')
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const authEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const leadId = requireLeadId(body?.lead_id)
    const requestEmail = requireEmail(body?.user_email)

    if (!leadId) {
      return json(400, { code: 'invalid_request', message: 'missing lead_id' })
    }
    if (!requestEmail) {
      return json(400, { code: 'invalid_request', message: 'missing user_email' })
    }
    if (normalizeEmail(requestEmail) !== authEmail) {
      return json(403, { code: 'forbidden', message: 'user_email mismatch' })
    }

    const supabase = getServiceSupabase()
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('id', leadId)
      .maybeSingle()

    if (leadError) {
      safeLog('lead_lookup_failed', { reason: 'db_error' })
      return json(500, { code: 'internal_error', message: 'Failed to load lead' })
    }
    if (!lead) {
      return json(404, { code: 'not_found', message: 'Lead not found' })
    }

    const leadRow = lead as LeadRow

    safeLog('enrich_started', { lead_id: leadId })

    const [googleSettled, webSettled] = await Promise.allSettled([
      runGoogleContactsJob(authEmail, leadRow),
      runWebResearchJob(leadRow),
    ])

    let google_contact: GoogleContactMatch | null = null
    let google_contacts_status: GoogleContactsStatus = 'error'

    if (googleSettled.status === 'fulfilled') {
      google_contact = googleSettled.value.contact
      google_contacts_status = googleSettled.value.status
    } else {
      safeLog('google_contacts_settled_rejected')
    }

    let web_research: WebResearchResult = emptyWebResearch('Web research unavailable')
    if (webSettled.status === 'fulfilled') {
      web_research = webSettled.value
    } else {
      safeLog('web_research_settled_rejected')
    }

    const enriched_at = new Date().toISOString()

    safeLog('enrich_completed', {
      lead_id: leadId,
      google_status: google_contacts_status,
    })

    return json(200, {
      google_contact,
      google_contacts_status,
      web_research,
      enriched_at,
    })
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { code: 'unauthenticated' })
    }
    safeLog('unexpected_error', {
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    })
    return json(500, { code: 'internal_error', message: 'Unexpected error' })
  }
}
