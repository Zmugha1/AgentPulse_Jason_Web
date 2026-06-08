import type { Handler } from '@netlify/functions'
import { getValidAccessToken } from '../../src/lib/googleTokenRefresh'
import { OAuthAuthError, requireAuthenticatedUser } from './google-oauth-shared'

const LOG_MODULE = 'calendar-events'

// TODO(phase-7c+): read user timezone from Google userinfo instead of fixed zone.
const USER_TIMEZONE = 'America/Chicago'

export type CalendarEventDto = {
  id: string
  summary: string
  start_time: string
  end_time: string
  location: string | null
  attendees_count: number
  attendee_emails: string[]
}

type GoogleCalendarEvent = {
  id?: string
  summary?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; self?: boolean }>
}

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEvent[]
  error?: { message?: string; status?: string }
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

function errorResponse(statusCode: number, code: string, message: string) {
  return json(statusCode, { code, message })
}

type CalendarRange = 'today' | 'week'

function todayYmdInTimeZone(timeZone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone })
}

function addDaysToYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Start/end of calendar day in `timeZone`, as RFC3339 UTC instants for Google API. */
function getTodayBoundsInTimeZone(timeZone: string): {
  timeMin: string
  timeMax: string
} {
  const ymd = todayYmdInTimeZone(timeZone)
  const [year, month, day] = ymd.split('-').map(Number)

  const offsetMs = getTimeZoneOffsetMs(timeZone, new Date())
  const startUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs
  const endUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs

  return {
    timeMin: new Date(startUtc).toISOString(),
    timeMax: new Date(endUtc).toISOString(),
  }
}

/** Today 00:00 through start of day 7 days later (exclusive), in `timeZone`. */
function getWeekBoundsInTimeZone(timeZone: string): {
  timeMin: string
  timeMax: string
} {
  const todayYmd = todayYmdInTimeZone(timeZone)
  const exclusiveEndYmd = addDaysToYmd(todayYmd, 7)
  return {
    timeMin: zonedStartOfDate(todayYmd, timeZone),
    timeMax: zonedStartOfDate(exclusiveEndYmd, timeZone),
  }
}

function getBoundsForRange(
  range: CalendarRange,
  timeZone: string,
): { timeMin: string; timeMax: string } {
  return range === 'week'
    ? getWeekBoundsInTimeZone(timeZone)
    : getTodayBoundsInTimeZone(timeZone)
}

function getTimeZoneOffsetMs(timeZone: string, at: Date): number {
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  const zoned = new Date(at.toLocaleString('en-US', { timeZone }))
  return zoned.getTime() - utc.getTime()
}

function zonedStartOfDate(dateYmd: string, timeZone: string): string {
  const [year, month, day] = dateYmd.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const offsetMs = getTimeZoneOffsetMs(timeZone, probe)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs).toISOString()
}

function zonedEndOfDate(dateYmd: string, timeZone: string): string {
  const [year, month, day] = dateYmd.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const offsetMs = getTimeZoneOffsetMs(timeZone, probe)
  return new Date(
    Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs,
  ).toISOString()
}

/** Timed events use dateTime; all-day events use date (end.date is exclusive). */
function parseEventBoundary(
  start: GoogleCalendarEvent['start'],
  end: GoogleCalendarEvent['end'],
  role: 'start' | 'end',
): string | null {
  const point = role === 'start' ? start : end
  if (!point) return null

  if (point.dateTime) return point.dateTime

  if (point.date) {
    const isAllDay = Boolean(start?.date && !start?.dateTime)
    if (role === 'start') {
      return zonedStartOfDate(point.date, USER_TIMEZONE)
    }
    if (isAllDay && end?.date) {
      const [y, m, d] = end.date.split('-').map(Number)
      const exclusiveEnd = new Date(Date.UTC(y, m - 1, d))
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1)
      const lastDayYmd = exclusiveEnd.toISOString().slice(0, 10)
      return zonedEndOfDate(lastDayYmd, USER_TIMEZONE)
    }
    return zonedEndOfDate(point.date, USER_TIMEZONE)
  }

  return null
}

function mapGoogleEvent(item: GoogleCalendarEvent): CalendarEventDto | null {
  const id = item.id?.trim()
  const start_time = parseEventBoundary(item.start, item.end, 'start')
  const end_time = parseEventBoundary(item.start, item.end, 'end')
  if (!id || !start_time || !end_time) return null

  const attendeeEmails =
    item.attendees
      ?.map((a) => a.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)) ?? []

  return {
    id,
    summary: item.summary?.trim() || '(No title)',
    start_time,
    end_time,
    location: item.location?.trim() || null,
    attendees_count: attendeeEmails.length,
    attendee_emails: attendeeEmails,
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'method_not_allowed', 'Method not allowed')
  }

  const rangeParam = event.queryStringParameters?.range ?? 'today'
  if (rangeParam !== 'today' && rangeParam !== 'week') {
    return errorResponse(
      400,
      'invalid_range',
      'Only range=today or range=week is supported',
    )
  }
  const range: CalendarRange = rangeParam

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = user.email!.trim().toLowerCase()

    const tokenResult = await getValidAccessToken(userEmail)
    if (!tokenResult.ok) {
      if (tokenResult.needs_reconnect) {
        safeLog('token_needs_reconnect', { reason: tokenResult.code })
        return errorResponse(
          401,
          'needs_reconnect',
          'Google account must be reconnected',
        )
      }
      safeLog('token_unavailable', { reason: tokenResult.code })
      return errorResponse(
        500,
        'internal_error',
        'Could not load Google credentials',
      )
    }

    const { timeMin, timeMax } = getBoundsForRange(range, USER_TIMEZONE)
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    })

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`

    const calendarRes = await fetch(calendarUrl, {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    })

    if (calendarRes.status === 401) {
      safeLog('google_calendar_unauthorized')
      return errorResponse(
        401,
        'needs_reconnect',
        'Google Calendar access was revoked',
      )
    }

    if (calendarRes.status === 403) {
      safeLog('google_calendar_forbidden')
      return errorResponse(
        403,
        'scope_insufficient',
        'Google Calendar permission is insufficient',
      )
    }

    let payload: GoogleCalendarListResponse
    try {
      payload = (await calendarRes.json()) as GoogleCalendarListResponse
    } catch {
      safeLog('google_calendar_parse_failed', { status: calendarRes.status })
      return errorResponse(
        500,
        'internal_error',
        'Could not read calendar response',
      )
    }

    if (!calendarRes.ok) {
      safeLog('google_calendar_error', {
        status: calendarRes.status,
        google_status: payload.error?.status,
      })
      return errorResponse(
        500,
        'internal_error',
        'Google Calendar request failed',
      )
    }

    const events =
      payload.items
        ?.map(mapGoogleEvent)
        .filter((e): e is CalendarEventDto => e !== null) ?? []

    safeLog('calendar_fetch_succeeded', {
      user_email: userEmail,
      range,
      event_count: events.length,
    })

    return json(200, { events })
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return errorResponse(401, 'unauthorized', 'Invalid or missing session')
    }
    safeLog('unexpected_error')
    return errorResponse(500, 'internal_error', 'Internal server error')
  }
}
