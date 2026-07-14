import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-listing-description'
const LISTING_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 800

const ALLOWED_PROPERTY_TYPES = new Set([
  'Single family',
  'Condo',
  'Townhouse',
  'Multi-family',
  'Land',
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

type GenerateListingDescriptionRequestBody = {
  address?: unknown
  price?: unknown
  bedrooms?: unknown
  bathrooms?: unknown
  square_footage?: unknown
  features?: unknown
  property_type?: unknown
}

type ListingFacts = {
  address: string
  price: number
  bedrooms: number
  bathrooms: number
  square_footage: number | null
  features: string
  property_type: string
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

function parseRequestBody(raw: string | null): GenerateListingDescriptionRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as GenerateListingDescriptionRequestBody
  } catch {
    return null
  }
}

function requireString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function requireFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  return requireFiniteNumber(value)
}

function requirePropertyType(value: unknown): string | null {
  const trimmed = requireString(value)
  if (!trimmed || !ALLOWED_PROPERTY_TYPES.has(trimmed)) return null
  return trimmed
}

function parseListingFacts(
  body: GenerateListingDescriptionRequestBody | null,
): ListingFacts | null {
  if (!body) return null

  const address = requireString(body.address)
  const price = requireFiniteNumber(body.price)
  const bedrooms = requireFiniteNumber(body.bedrooms)
  const bathrooms = requireFiniteNumber(body.bathrooms)
  const square_footage = optionalFiniteNumber(body.square_footage)
  const features = requireString(body.features)
  const property_type = requirePropertyType(body.property_type)

  if (
    !address ||
    price === null ||
    bedrooms === null ||
    bathrooms === null ||
    !features ||
    !property_type
  ) {
    return null
  }

  return {
    address,
    price,
    bedrooms,
    bathrooms,
    square_footage,
    features,
    property_type,
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

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price)
}

function buildListingPrompt(voiceProfile: string, facts: ListingFacts): string {
  const sqftLine =
    facts.square_footage !== null
      ? `Square footage: ${facts.square_footage}`
      : 'Square footage: not provided'

  return [
    'You are writing listing marketing content for a Lake Country Wisconsin real estate agent. Write in the agent\'s voice using the profile provided. Never use em dashes. Return two variants only: an email body to send to leads, and a short social caption.',
    '',
    'Agent voice profile (STZ answers):',
    voiceProfile,
    '',
    `Address: ${facts.address}`,
    `Price: ${formatPrice(facts.price)}`,
    `Bedrooms: ${facts.bedrooms}`,
    `Bathrooms: ${facts.bathrooms}`,
    sqftLine,
    `Property type: ${facts.property_type}`,
    `Key features: ${facts.features}`,
    '',
    'Rules:',
    '- Return only valid JSON with keys email_body and social_caption. No markdown fences, no preamble, no extra keys.',
    '- email_body: 150-200 words, warm personal tone, highlights key features, ends with a soft call to action to reach out for a showing. Use \\n\\n between paragraphs.',
    '- social_caption: 40-60 words, punchy, leads with the most compelling feature, includes exactly 3 hashtags.',
    '- Never use em dashes (--) in your output. Use commas, periods, or line breaks instead.',
    '- Do not write any phone number anywhere.',
    '- Do not write a signature, sign-off name, or closing contact block.',
    '- JSON shape: {"email_body":"...","social_caption":"..."}',
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
): { email_body?: string; social_caption?: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as { email_body?: string; social_caption?: string }
  } catch {
    // continue
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as {
        email_body?: string
        social_caption?: string
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
        email_body?: string
        social_caption?: string
      }
    } catch {
      return null
    }
  }
  return null
}

async function callAnthropicForListing(prompt: string): Promise<{
  email_body: string
  social_caption: string
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: LISTING_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = extractTextFromMessage(response.content)
  const parsed = tryParseJsonPayload(rawText)
  const email_body = parsed?.email_body?.trim() ?? ''
  const social_caption = parsed?.social_caption?.trim() ?? ''
  if (!email_body || !social_caption) {
    throw new Error('Anthropic returned invalid listing description JSON')
  }
  return { email_body, social_caption }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const facts = parseListingFacts(body)
    if (!facts) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing or invalid listing fields',
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
    const prompt = buildListingPrompt(voiceProfile, facts)

    safeLog('generate_started', {
      property_type: facts.property_type,
      features_length: facts.features.length,
      has_square_footage: facts.square_footage !== null,
    })

    let email_body: string
    let social_caption: string
    try {
      const draft = await callAnthropicForListing(prompt)
      email_body = draft.email_body
      social_caption = draft.social_caption
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic request failed'
      safeLog('anthropic_call_failed', {
        message: message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to generate listing description',
      })
    }

    safeLog('generate_completed', { property_type: facts.property_type })
    return json(200, { email_body, social_caption })
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
