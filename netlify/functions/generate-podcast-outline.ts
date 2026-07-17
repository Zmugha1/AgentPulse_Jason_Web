import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-podcast-outline'
const PODCAST_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1200
const DEFAULT_DURATION_MINUTES = 20
const ALLOWED_DURATIONS = new Set([10, 20, 30])

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

type GeneratePodcastOutlineRequestBody = {
  topic?: unknown
  duration_minutes?: unknown
  market_context?: unknown
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

function parseRequestBody(raw: string | null): GeneratePodcastOutlineRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as GeneratePodcastOutlineRequestBody
  } catch {
    return null
  }
}

function requireTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function optionalMarketContext(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function resolveDurationMinutes(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && ALLOWED_DURATIONS.has(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && ALLOWED_DURATIONS.has(parsed)) {
      return parsed
    }
  }
  return DEFAULT_DURATION_MINUTES
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

function buildPodcastPrompt(
  voiceProfile: string,
  topic: string,
  durationMinutes: number,
  marketContext: string | null,
): string {
  return [
    'You are writing a podcast talk track for a Lake Country Wisconsin real estate agent. Write in the agent\'s voice using the profile provided. Never use em dashes. Return a complete episode outline the agent can read on camera or record as audio.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    `Topic: ${topic}`,
    `Episode length: ${durationMinutes} minutes`,
    `Market context: ${marketContext ?? 'none provided'}`,
    '',
    'Rules:',
    '- Return only valid JSON with keys episode_title, opening_hook, talking_points, and closing_cta. No markdown fences, no preamble, no extra keys.',
    '- episode_title: catchy, under 60 characters, specific to the real estate topic.',
    '- opening_hook: 2-3 sentences to grab attention in the first 30 seconds. Personal and direct. Reference Lake Country or the Wisconsin market when relevant.',
    '- talking_points: 4-6 bullet points, each on its own line starting with a dash and a space. Each bullet is 2-3 sentences with enough substance to fill the requested duration when spoken aloud. Use \\n between bullets.',
    '- closing_cta: exactly 2 sentences encouraging listeners to reach out to Jason for a free market analysis or home valuation.',
    '- Never use em dashes (--) in your output. Use commas, periods, or line breaks instead.',
    '- Do not write any phone number anywhere.',
    '- Do not write a signature, sign-off name, or closing contact block.',
    '- JSON shape: {"episode_title":"...","opening_hook":"...","talking_points":"...","closing_cta":"..."}',
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
  episode_title?: string
  opening_hook?: string
  talking_points?: string
  closing_cta?: string
} | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as {
      episode_title?: string
      opening_hook?: string
      talking_points?: string
      closing_cta?: string
    }
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as {
        episode_title?: string
        opening_hook?: string
        talking_points?: string
        closing_cta?: string
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
        episode_title?: string
        opening_hook?: string
        talking_points?: string
        closing_cta?: string
      }
    } catch {
      return null
    }
  }
  return null
}

function normalizeTalkingPoints(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item !== 'string') return ''
        const trimmed = item.trim()
        if (!trimmed) return ''
        return trimmed.startsWith('-') ? trimmed : `- ${trimmed}`
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

async function callAnthropicForPodcast(prompt: string): Promise<{
  episode_title: string
  opening_hook: string
  talking_points: string
  closing_cta: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: PODCAST_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const episode_title = parsed?.episode_title?.trim() ?? ''
  const opening_hook = parsed?.opening_hook?.trim() ?? ''
  const talking_points = normalizeTalkingPoints(parsed?.talking_points)
  const closing_cta = parsed?.closing_cta?.trim() ?? ''
  if (!episode_title || !opening_hook || !talking_points || !closing_cta) {
    throw new Error('Anthropic returned invalid podcast outline JSON')
  }
  return {
    episode_title: episode_title.slice(0, 60),
    opening_hook,
    talking_points,
    closing_cta,
  }
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
    const durationMinutes = resolveDurationMinutes(body?.duration_minutes)
    const marketContext = optionalMarketContext(body?.market_context)

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
    const prompt = buildPodcastPrompt(
      voiceProfile,
      topic,
      durationMinutes,
      marketContext,
    )

    safeLog('generate_started', {
      topic_length: topic.length,
      duration_minutes: durationMinutes,
      has_market_context: marketContext !== null,
    })

    let episode_title: string
    let opening_hook: string
    let talking_points: string
    let closing_cta: string
    try {
      const draft = await callAnthropicForPodcast(prompt)
      episode_title = draft.episode_title
      opening_hook = draft.opening_hook
      talking_points = draft.talking_points
      closing_cta = draft.closing_cta
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to generate podcast outline',
      })
    }

    safeLog('generate_completed', {
      topic_length: topic.length,
      duration_minutes: durationMinutes,
    })
    return json(200, {
      episode_title,
      opening_hook,
      talking_points,
      closing_cta,
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
