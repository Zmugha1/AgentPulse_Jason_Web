import type { Handler } from '@netlify/functions'
import {
  callAnthropicForResearch,
  type ResearchBullet,
} from '../../src/lib/anthropicClient'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'research-attendee'
const CACHE_TTL_DAYS = 30

type ResearchRequestBody = {
  calendar_event_id?: unknown
  attendee_email?: unknown
  event_summary?: unknown
}

type BriefContent = {
  bullets: ResearchBullet[]
  could_not_verify: boolean
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

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string | { field: string } {
  if (typeof value !== 'string') {
    return { field: fieldName }
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return { field: fieldName }
  }
  return trimmed
}

function parseRequestBody(raw: string | null): ResearchRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as ResearchRequestBody
  } catch {
    return null
  }
}

function extractSourceUrls(bullets: ResearchBullet[]): string[] {
  const urls = bullets
    .map((bullet) => bullet.source_url?.trim())
    .filter((url): url is string => Boolean(url))
  return [...new Set(urls)]
}

function parseBriefContent(raw: unknown): BriefContent | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as {
    bullets?: unknown
    could_not_verify?: unknown
  }
  if (!Array.isArray(record.bullets)) return null
  if (typeof record.could_not_verify !== 'boolean') return null

  const bullets: ResearchBullet[] = []
  for (const item of record.bullets) {
    if (!item || typeof item !== 'object') continue
    const row = item as { text?: unknown; source_url?: unknown }
    if (typeof row.text !== 'string' || !row.text.trim()) continue
    bullets.push({
      text: row.text.trim(),
      source_url:
        typeof row.source_url === 'string' && row.source_url.trim()
          ? row.source_url.trim()
          : null,
    })
  }

  return {
    bullets,
    could_not_verify: record.could_not_verify,
  }
}

function cacheExpiresAtIso(): string {
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + CACHE_TTL_DAYS)
  return expiresAt.toISOString()
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    if (!body) {
      return json(400, {
        code: 'invalid_request',
        message: 'invalid JSON body',
      })
    }

    const eventIdResult = requireNonEmptyString(
      body.calendar_event_id,
      'calendar_event_id',
    )
    if (typeof eventIdResult !== 'string') {
      return json(400, {
        code: 'invalid_request',
        message: `missing field ${eventIdResult.field}`,
      })
    }

    const attendeeRaw = requireNonEmptyString(
      body.attendee_email,
      'attendee_email',
    )
    if (typeof attendeeRaw !== 'string') {
      return json(400, {
        code: 'invalid_request',
        message: `missing field ${attendeeRaw.field}`,
      })
    }
    const attendeeEmail = normalizeEmail(attendeeRaw)

    const summaryResult = requireNonEmptyString(
      body.event_summary,
      'event_summary',
    )
    if (typeof summaryResult !== 'string') {
      return json(400, {
        code: 'invalid_request',
        message: `missing field ${summaryResult.field}`,
      })
    }

    const supabase = getServiceSupabase()
    const nowIso = new Date().toISOString()

    const { data: cachedRow, error: cacheError } = await supabase
      .from('research_briefs')
      .select('brief_content, sources, expires_at')
      .eq('user_email', userEmail)
      .eq('calendar_event_id', eventIdResult)
      .eq('attendee_email', attendeeEmail)
      .gt('expires_at', nowIso)
      .maybeSingle()

    if (cacheError) {
      safeLog('cache_lookup_failed', { reason: 'db_error' })
      return json(500, { code: 'internal_error' })
    }

    if (cachedRow) {
      const brief = parseBriefContent(cachedRow.brief_content)
      if (brief) {
        safeLog('cache_hit', {
          user_email: userEmail,
          bullet_count: brief.bullets.length,
        })
        return json(200, {
          bullets: brief.bullets,
          could_not_verify: brief.could_not_verify,
          cached: true,
        })
      }
      safeLog('cache_hit_invalid_payload', { user_email: userEmail })
    }

    safeLog('cache_miss', {
      user_email: userEmail,
      attendee_domain: attendeeEmail.includes('@')
        ? attendeeEmail.split('@')[1]
        : 'unknown',
    })

    let research
    try {
      research = await callAnthropicForResearch(attendeeEmail, summaryResult)
    } catch {
      safeLog('anthropic_call_failed')
      return json(500, { code: 'internal_error' })
    }

    const briefContent: BriefContent = {
      bullets: research.bullets,
      could_not_verify: research.could_not_verify,
    }
    const sources = extractSourceUrls(research.bullets)
    const expiresAt = cacheExpiresAtIso()

    const { error: upsertError } = await supabase.from('research_briefs').upsert(
      {
        user_email: userEmail,
        calendar_event_id: eventIdResult,
        attendee_email: attendeeEmail,
        brief_content: briefContent,
        sources,
        expires_at: expiresAt,
      },
      { onConflict: 'user_email,calendar_event_id,attendee_email' },
    )

    if (upsertError) {
      safeLog('cache_upsert_failed', { reason: 'db_error' })
      return json(500, { code: 'internal_error' })
    }

    safeLog('research_succeeded', {
      user_email: userEmail,
      bullet_count: research.bullets.length,
      could_not_verify: research.could_not_verify,
      cached: false,
    })

    return json(200, {
      bullets: research.bullets,
      could_not_verify: research.could_not_verify,
      cached: false,
    })
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { code: 'unauthenticated' })
    }
    safeLog('unexpected_error')
    return json(500, { code: 'internal_error' })
  }
}
