import { ExternalLink, Loader2, MapPin, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lead } from '../lib/types'
import type { CalendarEvent } from '../services/calendarService'
import { findLeadsByEmails } from '../services/leadsService'
import {
  getNotesForEvent,
  saveNotesForEvent,
} from '../services/meetingNotesService'
import {
  researchAttendee,
  type ResearchErrorCode,
  type ResearchResult,
} from '../services/researchService'

const DISPLAY_TIMEZONE = 'America/Chicago'
const MAX_RESEARCH_ATTENDEES = 5

type NotesStatus = 'idle' | 'saving' | 'saved' | 'error'
type ResearchState = ResearchResult | 'loading'

type EventPreparePanelProps = {
  event: CalendarEvent
  userEmail: string
  onClose: () => void
  isOpen: boolean
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

function leadDisplayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || 'Unknown lead'
}

function formatLastContact(lastContactAt: string | null): string {
  if (!lastContactAt) return 'Never contacted'
  const date = new Date(lastContactAt)
  if (Number.isNaN(date.getTime())) return 'Never contacted'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatScore(score: number | null): string {
  if (score === null || score === undefined) return 'Score: not set'
  return `Score: ${score}`
}

function matchedLeadEmails(leads: Lead[]): Set<string> {
  const emails = new Set<string>()
  for (const lead of leads) {
    const email = lead.email?.trim().toLowerCase()
    if (email) emails.add(email)
  }
  return emails
}

function unmatchedAttendeeEmails(
  attendeeEmails: string[],
  matched: Set<string>,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of attendeeEmails) {
    const email = raw.trim().toLowerCase()
    if (!email || matched.has(email) || seen.has(email)) continue
    seen.add(email)
    result.push(email)
  }
  return result
}

function truncateUrl(url: string, maxLength = 48): string {
  if (url.length <= maxLength) return url
  return `${url.slice(0, maxLength - 3)}...`
}

function researchErrorMessage(error: ResearchErrorCode): string {
  if (error === 'unauthenticated') {
    return 'Could not research (session expired). Refresh to retry.'
  }
  if (error === 'invalid_request') {
    return 'Could not research (bad data).'
  }
  return 'Could not research right now.'
}

function AttendeeResearchCard({
  email,
  state,
}: {
  email: string
  state: ResearchState
}) {
  return (
    <li className="relative border border-mint rounded-lg p-4 bg-mint/40">
      <span className="absolute top-3 right-3 font-label text-[10px] uppercase tracking-wide bg-teal text-white px-2 py-0.5 rounded">
        AI
      </span>
      <p className="font-label text-xs text-slate pr-12 break-all">{email}</p>

      {state === 'loading' ? (
        <div className="mt-3 flex items-center gap-2 font-body text-sm text-slate">
          <Loader2 className="w-4 h-4 animate-spin text-teal" aria-hidden />
          <span>Researching this person...</span>
        </div>
      ) : state.error ? (
        <p className="font-body text-sm text-coral mt-3">
          {researchErrorMessage(state.error)}
        </p>
      ) : state.could_not_verify ? (
        <span className="inline-block mt-3 font-label text-xs text-coral bg-coral/10 border border-coral/30 px-2 py-1 rounded">
          Could not verify identity from public sources
        </span>
      ) : (
        <div className="mt-3 space-y-2">
          <ul className="space-y-2">
            {state.bullets.map((bullet, index) => (
              <li
                key={`${email}-${index}`}
                className="font-body text-sm text-navy flex gap-2"
              >
                <span className="text-teal shrink-0">•</span>
                <div className="min-w-0">
                  <p>{bullet.text}</p>
                  {bullet.source_url ? (
                    <a
                      href={bullet.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={bullet.source_url}
                      className="font-label text-xs text-teal inline-flex items-center gap-1 mt-1 hover:underline break-all"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                      {truncateUrl(bullet.source_url)}
                    </a>
                  ) : (
                    <p className="font-label text-xs text-coral mt-1">
                      (source not cited)
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {state.cached ? (
            <p className="font-label text-xs text-slate">Cached research</p>
          ) : null}
        </div>
      )}
    </li>
  )
}

function PublicResearchSection({
  attendeeEmails,
  matchedLeads,
  researchResults,
  overflowCount,
}: {
  attendeeEmails: string[]
  matchedLeads: Lead[] | null
  researchResults: Map<string, ResearchState>
  overflowCount: number
}) {
  const researchEmails = useMemo(() => {
    if (matchedLeads === null) return []
    const matched = matchedLeadEmails(matchedLeads)
    return unmatchedAttendeeEmails(attendeeEmails, matched).slice(
      0,
      MAX_RESEARCH_ATTENDEES,
    )
  }, [attendeeEmails, matchedLeads])

  return (
    <section>
      <h3 className="font-heading text-base text-navy">Public Research</h3>
      <div className="mt-2 bg-mint/60 border border-mint rounded-lg px-3 py-2">
        <p className="font-body text-xs text-slate">
          Researched from public web sources. Verify before relying on.
        </p>
      </div>

      {matchedLeads === null ? (
        <p className="font-body text-sm text-slate mt-3">
          Waiting for lead matches...
        </p>
      ) : researchEmails.length === 0 ? (
        <p className="font-body text-sm text-slate mt-3">
          All listed attendees are already matched to leads in AgentPulse.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {researchEmails.map((email) => (
              <AttendeeResearchCard
                key={email}
                email={email}
                state={researchResults.get(email) ?? 'loading'}
              />
            ))}
          </ul>
          {overflowCount > 0 ? (
            <p className="font-body text-sm text-slate mt-3">
              5+ attendees, showing first 5 for cost efficiency
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

export default function EventPreparePanel({
  event,
  userEmail,
  onClose,
  isOpen,
}: EventPreparePanelProps) {
  const [matchedLeads, setMatchedLeads] = useState<Lead[] | null>(null)
  const [researchResults, setResearchResults] = useState<
    Map<string, ResearchState>
  >(new Map())
  const [notes, setNotes] = useState('')
  const [notesStatus, setNotesStatus] = useState<NotesStatus>('idle')
  const [existingNotesLoaded, setExistingNotesLoaded] = useState(false)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const researchOverflowCount = useMemo(() => {
    if (matchedLeads === null) return 0
    const matched = matchedLeadEmails(matchedLeads)
    const unmatched = unmatchedAttendeeEmails(
      event.attendee_emails ?? [],
      matched,
    )
    return Math.max(0, unmatched.length - MAX_RESEARCH_ATTENDEES)
  }, [event.attendee_emails, matchedLeads])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setMatchedLeads(null)
    setResearchResults(new Map())
    setNotes('')
    setNotesStatus('idle')
    setExistingNotesLoaded(false)

    async function loadPanelData() {
      try {
        const [leads, existing] = await Promise.all([
          findLeadsByEmails(event.attendee_emails),
          getNotesForEvent(userEmail, event.id),
        ])
        if (cancelled) return
        setMatchedLeads(leads)
        setNotes(existing?.notes ?? '')
        setExistingNotesLoaded(true)
      } catch {
        if (cancelled) return
        setMatchedLeads([])
        setExistingNotesLoaded(true)
        setNotesStatus('error')
      }
    }

    void loadPanelData()

    return () => {
      cancelled = true
    }
  }, [isOpen, event.id, event.attendee_emails, userEmail])

  useEffect(() => {
    if (!isOpen || matchedLeads === null) return

    let cancelled = false
    const matched = matchedLeadEmails(matchedLeads)
    const toResearch = unmatchedAttendeeEmails(
      event.attendee_emails ?? [],
      matched,
    ).slice(0, MAX_RESEARCH_ATTENDEES)

    if (toResearch.length === 0) {
      setResearchResults(new Map())
      return
    }

    const loadingMap = new Map<string, ResearchState>()
    for (const email of toResearch) {
      loadingMap.set(email, 'loading')
    }
    setResearchResults(loadingMap)

    void Promise.all(
      toResearch.map(async (email) => {
        const result = await researchAttendee(event.id, email, event.summary)
        return { email, result }
      }),
    ).then((rows) => {
      if (cancelled) return
      setResearchResults((current) => {
        const next = new Map(current)
        for (const { email, result } of rows) {
          next.set(email, result)
        }
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [isOpen, event.id, event.summary, event.attendee_emails, matchedLeads])

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
      }
    }
  }, [])

  async function handleNotesBlur() {
    if (!existingNotesLoaded) return

    setNotesStatus('saving')
    try {
      await saveNotesForEvent(userEmail, event.id, event.summary, notes)
      setNotesStatus('saved')
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current)
      }
      savedTimeoutRef.current = setTimeout(() => {
        setNotesStatus('idle')
        savedTimeoutRef.current = null
      }, 2000)
    } catch {
      setNotesStatus('error')
    }
  }

  if (!isOpen) return null

  const timeRange = formatEventTimeRange(event.start_time, event.end_time)
  const attendeeEmails = event.attendee_emails ?? []
  const attendeeCountLabel =
    attendeeEmails.length === 1
      ? '1 attendee'
      : `${attendeeEmails.length} attendees`

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40 md:bg-navy/30 cursor-default"
        aria-label="Close prepare panel"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-prepare-title"
        className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 flex flex-col bg-cream w-full md:w-[min(560px,100vw)] md:min-w-[480px] md:shadow-[-8px_0_24px_rgba(45,68,89,0.12)]"
      >
        <header className="bg-navy text-white px-4 py-4 shrink-0 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id="event-prepare-title"
              className="font-heading text-lg md:text-xl leading-snug"
            >
              {event.summary}
            </h2>
            <p className="font-body text-sm text-mint mt-1">{timeRange}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 -mr-1 text-white hover:opacity-80 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          <section className="space-y-3">
            {event.location ? (
              <div className="flex items-start gap-2 font-body text-sm text-slate">
                <MapPin
                  className="w-4 h-4 mt-0.5 shrink-0 text-teal"
                  aria-hidden
                />
                <span>{event.location}</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center gap-2 font-body text-sm text-slate">
                <Users className="w-4 h-4 shrink-0 text-teal" aria-hidden />
                <span>{attendeeCountLabel}</span>
              </div>
              {attendeeEmails.length > 0 ? (
                <ul className="font-label text-xs text-slate space-y-1 pl-6">
                  {attendeeEmails.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              ) : (
                <p className="font-body text-sm text-slate pl-6">
                  No attendees listed
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="font-heading text-base text-navy">Lead Context</h3>

            {matchedLeads === null ? (
              <p className="font-body text-sm text-slate mt-3">
                Loading lead matches...
              </p>
            ) : matchedLeads.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {matchedLeads.map((lead) => (
                  <li
                    key={lead.id}
                    className="border border-mint rounded-lg p-4 bg-white"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-body font-bold text-navy">
                        {leadDisplayName(lead)}
                      </p>
                      {lead.is_archived ? (
                        <span className="font-label text-[10px] uppercase tracking-wide bg-slate/15 text-slate px-2 py-0.5 rounded">
                          Archived
                        </span>
                      ) : null}
                    </div>

                    {lead.purpose ? (
                      <p className="font-body text-sm text-navy mt-2">
                        {lead.purpose}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {lead.pipeline_stage ? (
                        <span className="font-label text-xs uppercase tracking-wide bg-teal text-white px-2 py-1 rounded">
                          {lead.pipeline_stage}
                        </span>
                      ) : null}
                      <span className="font-label text-xs text-slate">
                        {formatScore(lead.score)}
                      </span>
                    </div>

                    <p className="font-body text-sm text-slate mt-2">
                      Last contact: {formatLastContact(lead.last_contact_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 bg-mint/60 border border-mint rounded-lg p-4">
                <p className="font-body text-sm text-slate">
                  No lead match found. This event is on your calendar but no
                  attendee matches a lead in AgentPulse.
                </p>
              </div>
            )}
          </section>

          <PublicResearchSection
            attendeeEmails={attendeeEmails}
            matchedLeads={matchedLeads}
            researchResults={researchResults}
            overflowCount={researchOverflowCount}
          />

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-heading text-base text-navy">
                Notes for this meeting
              </h3>
              {notesStatus === 'saving' ? (
                <span className="font-label text-xs text-slate">Saving...</span>
              ) : notesStatus === 'saved' ? (
                <span className="font-label text-xs text-teal">Saved</span>
              ) : notesStatus === 'error' ? (
                <span className="font-label text-xs text-coral">
                  Save failed
                </span>
              ) : null}
            </div>
            <textarea
              rows={7}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void handleNotesBlur()}
              disabled={!existingNotesLoaded}
              className="font-label mt-3 w-full rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
              placeholder="Type prep notes for this meeting..."
            />
          </section>

          <div className="bg-mint/60 border border-mint rounded-lg p-4">
            <p className="font-body text-sm text-slate">
              AI-drafted prep brief coming in Phase 7d
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
