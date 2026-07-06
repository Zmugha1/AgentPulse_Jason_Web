import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-newsletter'
const NEWSLETTER_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1500
const DEFAULT_TONE = 'Warm and informative'

const STZ_PROFILE_SELECT =
  'q1_1, q1_2, q1_3, q1_4, q1_5, q2_1, q2_2, q2_3, q2_4, q2_5, q3_1, q3_2, q3_3, q3_4, q3_5, q4_1, q4_2, q4_3, q4_4, q4_5, q5_1, q5_2, q5_3, q5_4, q5_5, email_signature'

const STZ_QUESTION_KEYS = [
  'q1_1', 'q1_2', 'q1_3', 'q1_4', 'q1_5',
  'q2_1', 'q2_2', 'q2_3', 'q2_4', 'q2_5',
  'q3_1', 'q3_2', 'q3_3', 'q3_4', 'q3_5',
  'q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5',
  'q5_1', 'q5_2', 'q5_3', 'q5_4', 'q5_5',
] as const

const FALLBACK_VOICE =
  'A Lake Country Wisconsin real estate professional who is direct, friendly, and locally knowledgeable. Avoids generic CRM language.'

type GenerateNewsletterRequestBody = {
  topic?: unknown
  tone?: unknown
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

function parseRequestBody(raw: string | null): GenerateNewsletterRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as GenerateNewsletterRequestBody
  } catch {
    return null
  }
}

function requireTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function resolveTone(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return DEFAULT_TONE
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

function buildNewsletterPrompt(
  voiceProfile: string,
  topic: string,
  tone: string,
): string {
  return [
    'You are writing a newsletter for a real estate agent\'s client list of 1,890 people in Lake Country Wisconsin. Write in the agent\'s voice using the profile provided. Never use em dashes. The newsletter should feel personal not corporate. Keep it scannable with short paragraphs. Subject line under 60 characters. Body 300-500 words with natural paragraph breaks using newlines.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    `Topic: ${topic}`,
    `Tone: ${tone}`,
    '',
    'Rules:',
    '- Return only valid JSON with keys subject and body. No markdown fences, no preamble, no extra keys.',
    '- Use \\n\\n between paragraphs in the body string.',
    '- End the body with a soft call to action appropriate for the topic.',
    '- Never use em dashes (--) in your output. Use commas, periods, or line breaks instead.',
    '- Do not write a signature, sign-off name, phone number, or closing contact block. The signature will be appended automatically after generation.',
    '- JSON shape: {"subject":"...","body":"..."}',
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

async function callAnthropicForNewsletter(prompt: string): Promise<{
  subject: string
  body: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: NEWSLETTER_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const subject = parsed?.subject?.trim() ?? ''
  const body = parsed?.body?.trim() ?? ''
  if (!subject || !body) {
    throw new Error('Anthropic returned invalid newsletter JSON')
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
    const topic = requireTopic(body?.topic)
    if (!topic) {
      return json(400, { code: 'invalid_request', message: 'missing topic' })
    }
    const tone = resolveTone(body?.tone)

    const supabase = getServiceSupabase()

    const { data: profile, error: profileError } = await supabase
      .from('stz_profile')
      .select(STZ_PROFILE_SELECT)
      .eq('user_email', userEmail)
      .maybeSingle()

    if (profileError) {
      safeLog('stz_profile_lookup_failed', { reason: 'db_error' })
    }

    const profileRow = profile as Record<string, unknown> | null
    const emailSignature =
      typeof profileRow?.email_signature === 'string'
        ? profileRow.email_signature
        : null
    const voiceProfile = formatStzProfile(profileRow)
    const prompt = buildNewsletterPrompt(voiceProfile, topic, tone)

    safeLog('generate_started', { topic_length: topic.length })

    let subject: string
    let newsletterBody: string
    try {
      const draft = await callAnthropicForNewsletter(prompt)
      subject = draft.subject
      newsletterBody = draft.body
      const trimmedSignature = emailSignature?.trim()
      if (trimmedSignature) {
        newsletterBody = `${newsletterBody}\n\n${trimmedSignature}`
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, { code: 'internal_error', message: 'Failed to generate newsletter' })
    }

    safeLog('generate_completed', { topic_length: topic.length })
    return json(200, { subject, body: newsletterBody })
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
