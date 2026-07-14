import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-social-post'
const SOCIAL_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 800

const ALLOWED_POST_TYPES = new Set([
  'New listing',
  'Just sold',
  'Market update',
  'General / personal brand',
])

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

type GenerateSocialPostRequestBody = {
  post_type?: unknown
  details?: unknown
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

function parseRequestBody(raw: string | null): GenerateSocialPostRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as GenerateSocialPostRequestBody
  } catch {
    return null
  }
}

function requirePostType(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || !ALLOWED_POST_TYPES.has(trimmed)) return null
  return trimmed
}

function requireDetails(value: unknown): string | null {
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

function buildSocialPostPrompt(
  voiceProfile: string,
  postType: string,
  details: string,
): string {
  return [
    'You are writing social media posts for a Lake Country Wisconsin real estate agent. Write in the agent\'s voice using the profile provided. Never use em dashes. Return two variants only: one shared post for Facebook and Instagram, and one LinkedIn post.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    `Post type: ${postType}`,
    `Details: ${details}`,
    '',
    'Rules:',
    '- Return only valid JSON with keys social and linkedin. No markdown fences, no preamble, no extra keys.',
    '- social (Facebook + Instagram): warm, conversational, 2-3 sentences, 1-2 relevant emoji, end with 3-5 hashtags such as #LakeCountryHomes #WisconsinRealEstate.',
    '- linkedin: professional tone, positions the agent as a market expert, 3-4 sentences, no emoji, no hashtags.',
    '- Never use em dashes (--) in your output. Use commas, periods, or line breaks instead.',
    '- Do not write any phone number anywhere.',
    '- Do not write a signature, sign-off name, or closing contact block.',
    '- JSON shape: {"social":"...","linkedin":"..."}',
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

function tryParseJsonPayload(
  text: string,
): { social?: string; linkedin?: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as { social?: string; linkedin?: string }
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as {
        social?: string
        linkedin?: string
      }
    } catch {
      return null
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as {
        social?: string
        linkedin?: string
      }
    } catch {
      return null
    }
  }
  return null
}

async function callAnthropicForSocialPost(prompt: string): Promise<{
  social: string
  linkedin: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: SOCIAL_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const social = parsed?.social?.trim() ?? ''
  const linkedin = parsed?.linkedin?.trim() ?? ''
  if (!social || !linkedin) {
    throw new Error('Anthropic returned invalid social post JSON')
  }
  return { social, linkedin }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const postType = requirePostType(body?.post_type)
    if (!postType) {
      return json(400, { code: 'invalid_request', message: 'missing or invalid post_type' })
    }
    const details = requireDetails(body?.details)
    if (!details) {
      return json(400, { code: 'invalid_request', message: 'missing details' })
    }

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
    const voiceProfile = formatStzProfile(profileRow)
    const prompt = buildSocialPostPrompt(voiceProfile, postType, details)

    safeLog('generate_started', {
      post_type: postType,
      details_length: details.length,
    })

    let social: string
    let linkedin: string
    try {
      const draft = await callAnthropicForSocialPost(prompt)
      social = draft.social
      linkedin = draft.linkedin
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, { code: 'internal_error', message: 'Failed to generate social posts' })
    }

    safeLog('generate_completed', { post_type: postType })
    return json(200, { social, linkedin })
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
