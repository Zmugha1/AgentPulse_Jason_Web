import { supabase } from '../lib/supabase'

export type ResearchBullet = {
  text: string
  source_url: string | null
}

export type ResearchErrorCode =
  | 'unauthenticated'
  | 'invalid_request'
  | 'internal_error'

export type ResearchResult = {
  bullets: ResearchBullet[]
  could_not_verify: boolean
  cached: boolean
  error?: ResearchErrorCode
}

function emptyErrorResult(error: ResearchErrorCode): ResearchResult {
  return {
    bullets: [],
    could_not_verify: true,
    cached: false,
    error,
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    return null
  }
  return data.session.access_token
}

function normalizeBullets(raw: unknown): ResearchBullet[] {
  if (!Array.isArray(raw)) return []
  const bullets: ResearchBullet[] = []
  for (const item of raw) {
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
  return bullets
}

export async function researchAttendee(
  eventId: string,
  attendeeEmail: string,
  eventSummary: string,
): Promise<ResearchResult> {
  const calendarEventId = eventId.trim()
  const email = attendeeEmail.trim().toLowerCase()
  const summary = eventSummary.trim()

  if (!calendarEventId || !email || !summary) {
    return emptyErrorResult('invalid_request')
  }

  const token = await getAccessToken()
  if (!token) {
    return emptyErrorResult('unauthenticated')
  }

  try {
    const res = await fetch('/api/research-attendee', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        calendar_event_id: calendarEventId,
        attendee_email: email,
        event_summary: summary,
      }),
    })

    const body = (await res.json()) as {
      bullets?: unknown
      could_not_verify?: boolean
      cached?: boolean
      code?: string
    }

    if (res.status === 401) {
      return emptyErrorResult('unauthenticated')
    }

    if (res.status === 400) {
      return emptyErrorResult('invalid_request')
    }

    if (!res.ok) {
      return emptyErrorResult('internal_error')
    }

    return {
      bullets: normalizeBullets(body.bullets),
      could_not_verify: Boolean(body.could_not_verify),
      cached: Boolean(body.cached),
    }
  } catch {
    return emptyErrorResult('internal_error')
  }
}
