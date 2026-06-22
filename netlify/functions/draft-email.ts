import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'draft-email'
const EMAIL_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1000

const STZ_PROFILE_SELECT =
  'q1_1, q1_2, q1_3, q1_4, q1_5, q2_1, q2_2, q2_3, q2_4, q2_5, q3_1, q3_2, q3_3, q3_4, q3_5, q4_1, q4_2, q4_3, q4_4, q4_5, q5_1, q5_2, q5_3, q5_4, q5_5'

const LEAD_SELECT =
  'id, first_name, last_name, email, phone, address, zip, source, original_lead_date, last_contact_at, pipeline_stage, score, status, budget_max, listing_price, purpose'

const STZ_QUESTION_KEYS = [
  'q1_1', 'q1_2', 'q1_3', 'q1_4', 'q1_5',
  'q2_1', 'q2_2', 'q2_3', 'q2_4', 'q2_5',
  'q3_1', 'q3_2', 'q3_3', 'q3_4', 'q3_5',
  'q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5',
  'q5_1', 'q5_2', 'q5_3', 'q5_4', 'q5_5',
] as const

const FALLBACK_VOICE =
  'A Lake Country Wisconsin real estate professional who is direct, friendly, and locally knowledgeable. Avoids generic CRM language.'

type DraftEmailRequestBody = {
  lead_id?: unknown
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
  original_lead_date: string | null
  last_contact_at: string | null
  pipeline_stage: string | null
  score: number | null
  status: string | null
  budget_max: number | null
  listing_price: number | null
  purpose: string | null
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

function parseRequestBody(raw: string | null): DraftEmailRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as DraftEmailRequestBody
  } catch {
    return null
  }
}

function requireLeadId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function formatStzProfile(row: Record<string, unknown> | null): string {
  if (!row) return FALLBACK_VOICE
  const lines: string[] = []
  for (const key of STZ_QUESTION_KEYS) {
    const answer = row[key]
    if (typeof answer === 'string' && answer.trim()) {
      lines.push(`${key}: ${answer.trim()}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : FALLBACK_VOICE
}

function leadTemperature(score: number | null): 'hot' | 'warm' | 'cold' {
  const value = score ?? 0
  if (value >= 7) return 'hot'
  if (value >= 4) return 'warm'
  return 'cold'
}

function temperatureGuidance(
  temp: 'hot' | 'warm' | 'cold',
  source: string | null,
): string {
  const sourceNote =
    source === 'realtor.com' || source?.includes('realtor')
      ? 'Realtor.com lead: reference the specific property they inquired about and their message.'
      : ''

  if (temp === 'hot') {
    return `Hot lead: create urgency, specific call to action, offer to schedule a showing this week. ${sourceNote}`.trim()
  }
  if (temp === 'warm') {
    return `Warm lead: friendly market update, soft ask for a call when timing is right. ${sourceNote}`.trim()
  }
  return `Cold lead: value-add touch, no pressure, recent market insight for their target area. ${sourceNote}`.trim()
}

function formatLeadContext(lead: LeadRow): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || 'Unknown'
  return [
    `Name: ${name}`,
    `Source: ${lead.source ?? 'unknown'}`,
    `Purpose / inquiry: ${lead.purpose ?? 'none'}`,
    `Pipeline stage: ${lead.pipeline_stage ?? 'new'}`,
    `Score: ${lead.score ?? 'unknown'}`,
    `Status: ${lead.status ?? 'unknown'}`,
    `Original lead date: ${lead.original_lead_date ?? 'unknown'}`,
    `Last contact: ${lead.last_contact_at ?? 'never'}`,
    `Address: ${lead.address ?? 'none'}`,
    `Budget max: ${lead.budget_max ?? 'unknown'}`,
    `Listing price: ${lead.listing_price ?? 'unknown'}`,
    `Phone: ${lead.phone ?? 'none'}`,
  ].join('\n')
}

function buildEmailPrompt(voiceProfile: string, lead: LeadRow): string {
  const temp = leadTemperature(lead.score)
  return [
    'Write a professional real estate email for this lead.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    'Lead data:',
    formatLeadContext(lead),
    '',
    'Temperature and source guidance:',
    temperatureGuidance(temp, lead.source),
    '',
    'Rules:',
    '- Subject line under 60 characters.',
    '- Body under 200 words.',
    '- Sounds like Jason wrote it personally, not a CRM template.',
    '- No generic openers like "I hope this email finds you well."',
    '- Reference something specific about this lead.',
    '- Return JSON only, no markdown fences:',
    '{"subject":"...","body":"..."}',
    '- Never use em dashes (--) in your output. Use commas, periods, or line breaks instead. Never use the -- character anywhere.',
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

function tryParseJsonPayload(text: string): { subject?: string; body?: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as { subject?: string; body?: string }
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as { subject?: string; body?: string }
    } catch {
      return null
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as {
        subject?: string
        body?: string
      }
    } catch {
      return null
    }
  }
  return null
}

async function callAnthropicForEmail(prompt: string): Promise<{
  subject: string
  body: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: EMAIL_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const subject = parsed?.subject?.trim() ?? ''
  const body = parsed?.body?.trim() ?? ''
  if (!subject || !body) {
    throw new Error('Anthropic returned invalid email JSON')
  }
  return { subject: subject.slice(0, 60), body }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const leadId = requireLeadId(body?.lead_id)
    if (!leadId) {
      return json(400, { code: 'invalid_request', message: 'missing lead_id' })
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

    const { data: profile, error: profileError } = await supabase
      .from('stz_profile')
      .select(STZ_PROFILE_SELECT)
      .eq('user_email', userEmail)
      .maybeSingle()

    if (profileError) {
      safeLog('stz_profile_lookup_failed', { reason: 'db_error' })
    }

    const voiceProfile = formatStzProfile(
      profile as Record<string, unknown> | null,
    )
    const prompt = buildEmailPrompt(voiceProfile, lead as LeadRow)

    safeLog('draft_started', { lead_id: leadId })

    let subject: string
    let emailBody: string
    try {
      const draft = await callAnthropicForEmail(prompt)
      subject = draft.subject
      emailBody = draft.body
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, { code: 'internal_error', message: 'Failed to generate email draft' })
    }

    safeLog('draft_completed', { lead_id: leadId })
    return json(200, { subject, body: emailBody })
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
