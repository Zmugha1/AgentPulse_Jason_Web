import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import EventPreparePanel from '../components/EventPreparePanel'
import LeadCard from '../components/LeadCard'
import type { Lead } from '../lib/types'
import {
  getWeekEvents,
  groupEventsByDay,
  isGoogleConnected,
  weekDayKeysInChicago,
  type CalendarEvent,
  type CalendarEventsErrorCode,
} from '../services/calendarService'
import { getMorningBriefLeads } from '../services/morningBriefService'
import { supabase } from '../lib/supabase'

const AGENT_DISPLAY_NAME = 'Jason'
const DISPLAY_TIMEZONE = 'America/Chicago'

/** Morning 5am–12pm, afternoon 12pm–5pm, evening 5pm–5am. */
function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getPersonalizedGreeting(): string {
  return `${getTimeOfDayGreeting()}, ${AGENT_DISPLAY_NAME}`
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const durationMs = end.getTime() - start.getTime()
  if (durationMs >= 23 * 60 * 60 * 1000) {
    return 'All day'
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIMEZONE,
  })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

function attendeeLabel(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 attendee' : `${count} attendees`
}

function formatDayHeader(dayKey: string, todayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const weekday = probe.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: DISPLAY_TIMEZONE,
  })
  const monthDay = probe.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: DISPLAY_TIMEZONE,
  })
  if (dayKey === todayKey) {
    return `Today, ${weekday} ${monthDay}`
  }
  return `${weekday}, ${monthDay}`
}

function eventCountLabel(count: number): string {
  return count === 1 ? '1 event' : `${count} events`
}

function CalendarEventRow({
  event,
  onPrepare,
}: {
  event: CalendarEvent
  onPrepare: (event: CalendarEvent) => void
}) {
  const attendees = attendeeLabel(event.attendees_count)

  return (
    <li className="border border-mint rounded-lg p-4 bg-cream/40">
      <p className="font-label text-xs text-teal uppercase tracking-wide">
        {formatEventTimeRange(event.start_time, event.end_time)}
      </p>
      <p className="font-body text-navy mt-1">{event.summary}</p>
      {event.location ? (
        <p className="font-body text-sm text-slate mt-1">{event.location}</p>
      ) : null}
      {attendees ? (
        <p className="font-body text-sm text-slate mt-1">{attendees}</p>
      ) : null}
      <button
        type="button"
        onClick={() => onPrepare(event)}
        className="mt-3 font-body text-sm text-navy bg-white border border-mint rounded px-3 py-2 min-h-[44px] hover:bg-cream"
      >
        Prepare
      </button>
    </li>
  )
}

function WeeksCalendarSection({
  loading,
  connected,
  groupedEvents,
  dayKeys,
  expandedDays,
  onToggleDay,
  onPrepare,
  errorCode,
  errorMessage,
}: {
  loading: boolean
  connected: boolean | null
  groupedEvents: Record<string, CalendarEvent[]>
  dayKeys: string[]
  expandedDays: Set<string>
  onToggleDay: (dayKey: string) => void
  onPrepare: (event: CalendarEvent) => void
  errorCode: CalendarEventsErrorCode | null
  errorMessage: string | null
}) {
  const todayKey = dayKeys[0] ?? ''

  return (
    <section className="bg-white border border-mint rounded-lg p-6">
      <h3 className="font-heading text-lg text-navy">
        This Week&apos;s Calendar
      </h3>

      {loading ? (
        <p className="font-body text-sm text-slate mt-3">
          Loading this week&apos;s calendar...
        </p>
      ) : errorCode === 'needs_reconnect' ||
        errorCode === 'scope_insufficient' ? (
        <div className="mt-3 space-y-2">
          <p className="font-body text-sm text-coral">
            {errorMessage ?? 'Google Calendar connection needs attention.'}
          </p>
          <a
            href="/integrations"
            className="font-body text-sm text-teal underline hover:opacity-90"
          >
            Reconnect Google Account
          </a>
        </div>
      ) : connected === false ? (
        <div className="mt-3 space-y-2">
          <p className="font-body text-sm text-slate">
            Connect Google to see your calendar for the week ahead.
          </p>
          <a
            href="/integrations"
            className="font-body text-sm text-teal underline hover:opacity-90"
          >
            Connect Google Account on Integrations
          </a>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {dayKeys.map((dayKey) => {
            const events = groupedEvents[dayKey] ?? []
            const expanded = expandedDays.has(dayKey)

            return (
              <div
                key={dayKey}
                className="border border-mint rounded-lg overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => onToggleDay(dayKey)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left bg-cream/40 hover:bg-cream min-h-[44px]"
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronDown
                      className="w-4 h-4 text-navy shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <ChevronRight
                      className="w-4 h-4 text-navy shrink-0"
                      aria-hidden
                    />
                  )}
                  <span className="font-body text-navy flex-1 min-w-0">
                    {formatDayHeader(dayKey, todayKey)}
                  </span>
                  {events.length > 0 ? (
                    <span className="font-label text-[10px] uppercase tracking-wide text-slate bg-mint/60 px-2 py-0.5 rounded shrink-0">
                      {eventCountLabel(events.length)}
                    </span>
                  ) : null}
                </button>

                {expanded ? (
                  <div className="px-4 pb-4 pt-1 border-t border-mint bg-white">
                    {events.length === 0 ? (
                      <p className="font-body text-sm text-slate py-2">
                        No events
                      </p>
                    ) : (
                      <ul className="space-y-3 mt-2">
                        {events.map((event) => (
                          <CalendarEventRow
                            key={event.id}
                            event={event}
                            onPrepare={onPrepare}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function MorningBrief() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [leadsError, setLeadsError] = useState<string | null>(null)
  const [includeOlder, setIncludeOlder] = useState(false)

  const [calendarLoading, setCalendarLoading] = useState(true)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([])
  const [calendarErrorCode, setCalendarErrorCode] =
    useState<CalendarEventsErrorCode | null>(null)
  const [calendarErrorMessage, setCalendarErrorMessage] = useState<
    string | null
  >(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    () => new Set(weekDayKeysInChicago().slice(0, 1)),
  )
  const [selectedEventForPrep, setSelectedEventForPrep] =
    useState<CalendarEvent | null>(null)

  const dayKeys = useMemo(() => weekDayKeysInChicago(), [])
  const groupedEvents = useMemo(
    () => groupEventsByDay(weekEvents),
    [weekEvents],
  )

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true)
    setLeadsError(null)
    try {
      const rows = await getMorningBriefLeads(20, includeOlder ? null : 12)
      setLeads(rows)
    } catch (err) {
      setLeadsError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setLeadsLoading(false)
    }
  }, [includeOlder])

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true)
    setCalendarErrorCode(null)
    setCalendarErrorMessage(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const email = sessionData.session?.user?.email
      if (!email) {
        setUserEmail(null)
        setGoogleConnected(false)
        setWeekEvents([])
        return
      }

      setUserEmail(email)
      const connected = await isGoogleConnected(email)
      setGoogleConnected(connected)
      if (!connected) {
        setWeekEvents([])
        return
      }

      const result = await getWeekEvents()
      if (!result.ok) {
        setCalendarErrorCode(result.code)
        setCalendarErrorMessage(result.message)
        setWeekEvents([])
        return
      }

      setWeekEvents(result.events)
    } catch (err) {
      setCalendarErrorCode('error')
      setCalendarErrorMessage(
        err instanceof Error ? err.message : 'Failed to load calendar',
      )
      setWeekEvents([])
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  useEffect(() => {
    loadCalendar()
  }, [loadCalendar])

  function handleActionComplete(leadId: string) {
    setLeads((current) => current.filter((lead) => lead.id !== leadId))
  }

  function toggleDay(dayKey: string) {
    setExpandedDays((current) => {
      const next = new Set(current)
      if (next.has(dayKey)) {
        next.delete(dayKey)
      } else {
        next.add(dayKey)
      }
      return next
    })
  }

  const counterText = includeOlder
    ? `Showing ${leads.length} leads from all history`
    : `Showing ${leads.length} leads from the last 12 months`

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="bg-white border border-mint rounded-lg p-6">
        <h2 className="font-heading text-2xl text-navy">
          {getPersonalizedGreeting()}
        </h2>
        <p className="font-body text-sm text-slate mt-1">{formatToday()}</p>
        <p className="font-body text-navy mt-3">
          Today&apos;s top leads worth your time
        </p>
        {!leadsLoading && !leadsError ? (
          <p className="font-label text-xs text-slate mt-2">{counterText}</p>
        ) : null}
      </header>

      <WeeksCalendarSection
        loading={calendarLoading}
        connected={googleConnected}
        groupedEvents={groupedEvents}
        dayKeys={dayKeys}
        expandedDays={expandedDays}
        onToggleDay={toggleDay}
        onPrepare={setSelectedEventForPrep}
        errorCode={calendarErrorCode}
        errorMessage={calendarErrorMessage}
      />

      <label className="flex items-center gap-2 bg-white border border-mint rounded-lg px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={includeOlder}
          onChange={(e) => setIncludeOlder(e.target.checked)}
          className="h-4 w-4 accent-teal"
        />
        <span className="font-body text-sm text-navy">
          Include older leads (over 12 months)
        </span>
      </label>

      {leadsLoading ? (
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          <p className="font-body text-navy">Loading your morning brief…</p>
        </div>
      ) : leadsError ? (
        <div className="bg-white border border-mint rounded-lg p-6">
          <p className="font-body text-coral">{leadsError}</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          {includeOlder ? (
            <>
              <p className="font-body text-navy">
                No leads in your brief right now.
              </p>
              <p className="font-body text-sm text-slate mt-2">
                Check back later or review Lead Intelligence for the full list.
              </p>
            </>
          ) : (
            <>
              <p className="font-body text-navy">
                No leads from the last 12 months match your scoring profile.
              </p>
              <p className="font-body text-sm text-slate mt-2">
                Toggle on &apos;Include older leads&apos; to see all history.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onActionComplete={handleActionComplete}
            />
          ))}
        </div>
      )}

      {selectedEventForPrep && userEmail ? (
        <EventPreparePanel
          event={selectedEventForPrep}
          userEmail={userEmail}
          isOpen
          onClose={() => setSelectedEventForPrep(null)}
        />
      ) : null}
    </div>
  )
}
