import { supabase } from '../lib/supabase'

export type CalendarEvent = {
  id: string
  summary: string
  start_time: string
  end_time: string
  location: string | null
  attendees_count: number
  attendee_emails: string[]
}

export type CalendarEventsErrorCode =
  | 'needs_reconnect'
  | 'scope_insufficient'
  | 'not_connected'
  | 'error'

export type CalendarEventsResult =
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; code: CalendarEventsErrorCode; message: string }

const CACHE_TTL_MS = 5 * 60 * 1000

let cachedEvents: CalendarEvent[] | null = null
let cachedEventsAt = 0
let cachedConnected: boolean | null = null
let cachedConnectedEmail: string | null = null
let cachedConnectedAt = 0

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error('Not signed in')
  }
  return data.session.access_token
}

export function clearCalendarCache(): void {
  cachedEvents = null
  cachedEventsAt = 0
  cachedConnected = null
  cachedConnectedEmail = null
  cachedConnectedAt = 0
}

export async function isGoogleConnected(userEmail: string): Promise<boolean> {
  const email = userEmail.trim().toLowerCase()
  const now = Date.now()
  if (
    cachedConnected !== null &&
    cachedConnectedEmail === email &&
    now - cachedConnectedAt < CACHE_TTL_MS
  ) {
    return cachedConnected
  }

  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('user_email')
    .eq('user_email', email)
    .maybeSingle()

  if (error) {
    console.error('[calendarService] isGoogleConnected:', error.message)
    throw new Error('Failed to check Google connection')
  }

  const connected = Boolean(data)
  cachedConnected = connected
  cachedConnectedEmail = email
  cachedConnectedAt = now
  return connected
}

export async function getTodayEvents(): Promise<CalendarEventsResult> {
  const now = Date.now()
  if (cachedEvents && now - cachedEventsAt < CACHE_TTL_MS) {
    return { ok: true, events: cachedEvents }
  }

  const token = await getAccessToken()
  const res = await fetch('/api/calendar-events?range=today', {
    headers: { Authorization: `Bearer ${token}` },
  })

  const body = (await res.json()) as {
    events?: CalendarEvent[]
    code?: string
    message?: string
  }

  if (res.status === 401 && body.code === 'needs_reconnect') {
    clearCalendarCache()
    return {
      ok: false,
      code: 'needs_reconnect',
      message: body.message ?? 'Google account must be reconnected',
    }
  }

  if (res.status === 403 && body.code === 'scope_insufficient') {
    return {
      ok: false,
      code: 'scope_insufficient',
      message: body.message ?? 'Google Calendar permission is insufficient',
    }
  }

  if (!res.ok || !Array.isArray(body.events)) {
    return {
      ok: false,
      code: 'error',
      message: body.message ?? 'Failed to load calendar events',
    }
  }

  cachedEvents = body.events
  cachedEventsAt = now
  return { ok: true, events: body.events }
}
