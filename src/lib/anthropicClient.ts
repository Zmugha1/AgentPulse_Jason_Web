/**
 * @server-only Import from Netlify functions only. Never import in browser code.
 */
import Anthropic from '@anthropic-ai/sdk'

const LOG_MODULE = 'anthropicClient'
const RESEARCH_MODEL = 'claude-sonnet-4-5'
const MAX_OUTPUT_TOKENS = 1024
const MAX_BULLETS = 5

export type ResearchBullet = {
  text: string
  source_url: string | null
}

export type AnthropicResearchResult = {
  bullets: ResearchBullet[]
  could_not_verify: boolean
  raw_response: string
}

type ParsedResearchPayload = {
  bullets?: Array<{ text?: string; source_url?: string | null }>
  could_not_verify?: boolean
}

let anthropicClient: Anthropic | null = null

function safeLog(
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  console.log(JSON.stringify({ module: LOG_MODULE, event, ...fields }))
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

function buildSystemPrompt(): string {
  return [
    'You are a factual research assistant for a real estate professional preparing for meetings.',
    'Use web search to find publicly available professional information only.',
    'Respond with JSON only, no markdown fences or commentary.',
    'JSON shape: {"bullets":[{"text":"...","source_url":"https://..."}],"could_not_verify":false}',
    'Rules:',
    '- Maximum 5 bullet points.',
    '- Every bullet MUST include a source_url where the fact was found.',
    '- Factual only: name, employer, role, location, professional background.',
    '- Do NOT speculate about personality, motivations, or interests.',
    '- If identity cannot be verified from public sources, return exactly one bullet with text "Could not verify identity from public sources", source_url null, and could_not_verify true.',
  ].join(' ')
}

function buildUserPrompt(attendeeEmail: string, eventSummary: string): string {
  return [
    `Research the person with email ${attendeeEmail} who is attending a meeting titled "${eventSummary}".`,
    'Find publicly available professional information using web search.',
    '',
    'Strict rules:',
    '- Provide a maximum of 5 bullet points',
    '- Every bullet MUST cite a source URL where the info was found',
    '- Stick to factual information: name, current employer, role, location, professional background',
    '- DO NOT speculate about personality, motivations, or interests beyond what is directly stated in sources',
    '- If you cannot find verified information, return a single bullet "Could not verify identity from public sources" with could_not_verify true',
    '- Format response as JSON: {bullets: [{text, source_url}], could_not_verify: bool}',
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

function tryParseJsonPayload(text: string): ParsedResearchPayload | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as ParsedResearchPayload
  } catch {
    // continue
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as ParsedResearchPayload
    } catch {
      return null
    }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as ParsedResearchPayload
    } catch {
      return null
    }
  }

  return null
}

function normalizeBullets(
  raw: ParsedResearchPayload['bullets'],
): ResearchBullet[] {
  if (!Array.isArray(raw)) return []

  const bullets: ResearchBullet[] = []
  for (const item of raw) {
    if (!item || typeof item.text !== 'string') continue
    const text = item.text.trim()
    if (!text) continue
    const sourceUrl =
      typeof item.source_url === 'string' && item.source_url.trim()
        ? item.source_url.trim()
        : null
    bullets.push({ text, source_url: sourceUrl })
    if (bullets.length >= MAX_BULLETS) break
  }
  return bullets
}

function parseResearchResponse(rawText: string): AnthropicResearchResult {
  const payload = tryParseJsonPayload(rawText)
  if (!payload) {
    safeLog('research_parse_failed', { reason: 'invalid_json' })
    return {
      bullets: [],
      could_not_verify: true,
      raw_response: rawText,
    }
  }

  const bullets = normalizeBullets(payload.bullets)
  const couldNotVerify = Boolean(payload.could_not_verify)

  if (!Array.isArray(payload.bullets)) {
    safeLog('research_parse_failed', { reason: 'missing_bullets_array' })
    return {
      bullets: [],
      could_not_verify: true,
      raw_response: rawText,
    }
  }

  if (bullets.length === 0 && !couldNotVerify) {
    safeLog('research_parse_failed', { reason: 'empty_bullets' })
    return {
      bullets: [],
      could_not_verify: true,
      raw_response: rawText,
    }
  }

  return {
    bullets,
    could_not_verify: couldNotVerify,
    raw_response: rawText,
  }
}

export async function callAnthropicForResearch(
  attendeeEmail: string,
  eventSummary: string,
): Promise<AnthropicResearchResult> {
  const email = attendeeEmail.trim().toLowerCase()
  const summary = eventSummary.trim() || 'Meeting'
  const client = getAnthropicClient()

  safeLog('research_request_started', {
    attendee_domain: email.includes('@') ? email.split('@')[1] : 'unknown',
  })

  let response: Anthropic.Messages.Message
  try {
    response = await client.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(email, summary),
        },
      ],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
    })
  } catch (err) {
    safeLog('research_api_failed', {
      error_type: err instanceof Error ? err.name : 'unknown',
    })
    throw new Error('Anthropic research request failed')
  }

  const rawText = extractTextFromMessage(response.content)
  const parsed = parseResearchResponse(rawText)

  safeLog('research_request_completed', {
    bullet_count: parsed.bullets.length,
    could_not_verify: parsed.could_not_verify,
  })

  return parsed
}
