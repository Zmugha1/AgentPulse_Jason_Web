import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-market-blurb'
const MARKET_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1000

const ALLOWED_ANGLES = new Set([
  'For sellers',
  'For buyers',
  'General update',
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

type GenerateMarketBlurbRequestBody = {
  area?: unknown
  angle?: unknown
  market_data?: unknown
}

type MarketBlurbInput = {
  area: string | null
  angle: string
  market_data: string | null
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

function parseRequestBody(raw: string | null): GenerateMarketBlurbRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as GenerateMarketBlurbRequestBody
  } catch {
    return null
  }
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function requireAngle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || !ALLOWED_ANGLES.has(trimmed)) return null
  return trimmed
}

function parseMarketInput(
  body: GenerateMarketBlurbRequestBody | null,
): MarketBlurbInput | null {
  if (!body) return null
  const angle = requireAngle(body.angle)
  if (!angle) return null
  return {
    area: optionalString(body.area),
    angle,
    market_data: optionalString(body.market_data),
  }
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

function buildMarketBlurbPrompt(
  voiceProfile: string,
  input: MarketBlurbInput,
): string {
  return [
    'You are writing market update content for a Lake Country Wisconsin real estate agent. Write in the agent\'s voice using the profile provided. Never use em dashes. Return three variants: a newsletter blurb, a social post, and a blog intro.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    `Area: ${input.area ?? 'Lake Country Wisconsin (default if no area given)'}`,
    `Angle: ${input.angle}`,
    `Market data: ${input.market_data ?? 'none provided'}`,
    '',
    'Rules:',
    '- Return only valid JSON with keys newsletter_blurb, social_post, and blog_intro. No markdown fences, no preamble, no extra keys.',
    '- newsletter_blurb: 3-4 sentences, warm, references specific stats when market data is provided.',
    '- social_post: 2-3 sentences with exactly 3 hashtags.',
    '- blog_intro: 4-5 sentences, authoritative, positions the agent as the local expert, references specific data points when provided.',
    '- Match the angle (For sellers, For buyers, or General update).',
    '- If an area is provided, reference it naturally.',
    '- Never use em dashes (--) in your output. Use commas, periods, or line breaks instead.',
    '- Do not write any phone number anywhere.',
    '- Do not write a signature, sign-off name, or closing contact block.',
    '- JSON shape: {"newsletter_blurb":"...","social_post":"...","blog_intro":"..."}',
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
): {
  newsletter_blurb?: string
  social_post?: string
  blog_intro?: string
} | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as {
      newsletter_blurb?: string
      social_post?: string
      blog_intro?: string
    }
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as {
        newsletter_blurb?: string
        social_post?: string
        blog_intro?: string
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
        newsletter_blurb?: string
        social_post?: string
        blog_intro?: string
      }
    } catch {
      return null
    }
  }
  return null
}

async function callAnthropicForMarketBlurb(prompt: string): Promise<{
  newsletter_blurb: string
  social_post: string
  blog_intro: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: MARKET_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const newsletter_blurb = parsed?.newsletter_blurb?.trim() ?? ''
  const social_post = parsed?.social_post?.trim() ?? ''
  const blog_intro = parsed?.blog_intro?.trim() ?? ''
  if (!newsletter_blurb || !social_post || !blog_intro) {
    throw new Error('Anthropic returned invalid market blurb JSON')
  }
  return { newsletter_blurb, social_post, blog_intro }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const input = parseMarketInput(body)
    if (!input) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing or invalid angle',
      })
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
    const prompt = buildMarketBlurbPrompt(voiceProfile, input)

    safeLog('generate_started', {
      angle: input.angle,
      has_area: input.area !== null,
      has_market_data: input.market_data !== null,
      market_data_length: input.market_data?.length ?? 0,
    })

    let newsletter_blurb: string
    let social_post: string
    let blog_intro: string
    try {
      const draft = await callAnthropicForMarketBlurb(prompt)
      newsletter_blurb = draft.newsletter_blurb
      social_post = draft.social_post
      blog_intro = draft.blog_intro
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to generate market update',
      })
    }

    safeLog('generate_completed', { angle: input.angle })
    return json(200, { newsletter_blurb, social_post, blog_intro })
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
