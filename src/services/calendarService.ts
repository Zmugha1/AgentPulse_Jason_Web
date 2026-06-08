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
const DISPLAY_TIMEZONE = 'America/Chicago'
const WEEK_DAY_COUNT = 7

let cachedEvents: CalendarEvent[] | null = null
let cachedEventsAt = 0
let cachedWeekEvents: CalendarEvent[] | null = null
let cachedWeekEventsAt = 0
let cachedConnected: boolean | null = null
let cachedConnectedEmail: string | null = null
let cachedConnectedAt = 0

function todayYmdInTimeZone(timeZone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone })
}

function addDaysToYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function eventDateKeyInTimeZone(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone })
}

/** Seven date keys (today + next 6) in America/Chicago, ascending. */
export function weekDayKeysInChicago(): string[] {
  const todayYmd = todayYmdInTimeZone(DISPLAY_TIMEZONE)
  return Array.from({ length: WEEK_DAY_COUNT }, (_, i) =>
    addDaysToYmd(todayYmd, i),
  )
}

/**
 * Groups events by Chicago calendar day. Always returns all 7 week keys,
 * including empty arrays for days with no events.
 */
export function groupEventsByDay(
  events: CalendarEvent[],
): Record<string, CalendarEvent[]> {
  const grouped: Record<string, CalendarEvent[]> = {}
  for (const dayKey of weekDayKeysInChicago()) {
    grouped[dayKey] = []
  }

  for (const event of events) {
    const dayKey = eventDateKeyInTimeZone(event.start_time, DISPLAY_TIMEZONE)
    if (dayKey in grouped) {
      grouped[dayKey].push(event)
    }
  }

  for (const dayKey of Object.keys(grouped)) {
    grouped[dayKey].sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  return grouped
}

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
  cachedWeekEvents = null
  cachedWeekEventsAt = 0
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

export async function getWeekEvents(): Promise<CalendarEventsResult> {
  const now = Date.now()
  if (cachedWeekEvents && now - cachedWeekEventsAt < CACHE_TTL_MS) {
    return { ok: true, events: cachedWeekEvents }
  }

  const token = await getAccessToken()
  const res = await fetch('/api/calendar-events?range=week', {
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

  cachedWeekEvents = body.events
  cachedWeekEventsAt = now
  return { ok: true, events: body.events }
}
