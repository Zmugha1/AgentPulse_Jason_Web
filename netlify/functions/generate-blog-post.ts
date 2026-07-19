import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-blog-post'
const BLOG_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 2000
const DEFAULT_TARGET_AUDIENCE = 'Both'
const ALLOWED_AUDIENCES = new Set(['Sellers', 'Buyers', 'Both'])

const STZ_PROFILE_SELECT =
  'q1_1, q1_2, q1_3, q1_4, q1_5, q2_1, q2_2, q2_3, q2_4, q2_5, q3_1, q3_2, q3_3, q3_4, q3_5, q4_1, q4_2, q4_3, q4_4, q4_5, q5_1, q5_2, q5_3, q5_4, q5_5'

const STZ_QUESTION_KEYS = [
  'q1_1', 'q1_2', 'q1_3', 'q1_4', 'q1_5',
  'q2_1', 'q2_2', 'q2_3', 'q2_4', 'q2_5',
  'q3_1', 'q3_2', 'q3_3', 'q3_4', 'q3_5',
  'q4_1', 'q4_2', 'q4_3', 'q4_4', 'q4_5',
  'q5_1', 'q5_2', 'q5_3', 'q5_4', 'q5_5',
] as const

const FALLBACK_VOICE =
  'A Lake Country Wisconsin real estate professional who is direct, friendly, and locally knowledgeable. Avoids generic CRM language.'

type GenerateBlogPostRequestBody = {
  topic?: unknown
  market_data?: unknown
  target_audience?: unknown
}

type BlogPostPayload = {
  title?: string
  slug?: string
  meta_description?: string
  content?: string
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

function parseRequestBody(raw: string | null): GenerateBlogPostRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as GenerateBlogPostRequestBody
  } catch {
    return null
  }
}

function requireTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function optionalMarketData(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function resolveTargetAudience(value: unknown): string {
  if (typeof value === 'string' && ALLOWED_AUDIENCES.has(value.trim())) {
    return value.trim()
  }
  return DEFAULT_TARGET_AUDIENCE
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function buildBlogPrompt(
  voiceProfile: string,
  topic: string,
  targetAudience: string,
  marketData: string | null,
): string {
  return [
    'You are writing an SEO-optimized blog post for a Lake Country Wisconsin real estate agent\'s website. Write in the agent\'s voice using the profile provided. Never use em dashes. The post should feel personal and local, not corporate.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    `Topic: ${topic}`,
    `Target audience: ${targetAudience}`,
    `Market data: ${marketData ?? 'none provided'}`,
    '',
    'Rules:',
    '- Return only valid JSON with keys title, slug, meta_description, and content. No markdown fences, no preamble, no extra keys.',
    '- title: SEO-optimized, under 60 characters, includes Lake Country or Wisconsin location keyword.',
    '- slug: URL-safe version of the title, lowercase, hyphens only, no special characters.',
    '- meta_description: 120-155 characters, includes the primary keyword, compelling to click.',
    '- content: 600-900 words, written in the agent\'s voice, clear paragraphs with \\n\\n between paragraphs. Include specific data from market_data when provided. End with a soft CTA to contact Jason. Do not include phone numbers, a sign-off name, or a closing contact block.',
    '- Never use em dashes in your output. Use commas, periods, or line breaks instead.',
    '- JSON shape: {"title":"...","slug":"...","meta_description":"...","content":"..."}',
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

function tryParseJsonPayload(text: string): BlogPostPayload | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as BlogPostPayload
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as BlogPostPayload
    } catch {
      return null
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as BlogPostPayload
    } catch {
      return null
    }
  }
  return null
}

async function callAnthropicForBlogPost(prompt: string): Promise<{
  title: string
  slug: string
  meta_description: string
  content: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: BLOG_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const title = parsed?.title?.trim() ?? ''
  const metaDescription = parsed?.meta_description?.trim() ?? ''
  const content = parsed?.content?.trim() ?? ''
  const rawSlug = parsed?.slug?.trim() ?? ''
  const slug = slugify(rawSlug || title)

  if (!title || !slug || !metaDescription || !content) {
    throw new Error('Anthropic returned invalid blog post JSON')
  }

  return {
    title: title.slice(0, 60),
    slug,
    meta_description: metaDescription.slice(0, 155),
    content,
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
    const marketData = optionalMarketData(body?.market_data)
    const targetAudience = resolveTargetAudience(body?.target_audience)

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
    const prompt = buildBlogPrompt(voiceProfile, topic, targetAudience, marketData)

    safeLog('generate_started', {
      topic_length: topic.length,
      has_market_data: Boolean(marketData),
      target_audience: targetAudience,
    })

    let draft: {
      title: string
      slug: string
      meta_description: string
      content: string
    }
    try {
      draft = await callAnthropicForBlogPost(prompt)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, { code: 'internal_error', message: 'Failed to generate blog post' })
    }

    safeLog('generate_completed', {
      topic_length: topic.length,
      slug: draft.slug,
    })
    return json(200, draft)
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
