import { supabase } from '../lib/supabase'

const NOTES_SELECT =
  'id, user_email, calendar_event_id, event_summary, notes, created_at, updated_at'

export type MeetingNote = {
  id: string
  user_email: string
  calendar_event_id: string
  event_summary: string
  notes: string
  created_at: string
  updated_at: string
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) {
    console.error(`[meetingNotesService] ${context}:`, error.message)
    throw new Error(`${context}: ${error.message}`)
  }
}

function normalizeEmail(userEmail: string): string {
  return userEmail.trim().toLowerCase()
}

function normalizeEventId(calendarEventId: string): string {
  const trimmed = calendarEventId.trim()
  if (!trimmed) {
    throw new Error('saveNotesForEvent: calendar_event_id is required')
  }
  return trimmed
}

export async function getNotesForEvent(
  userEmail: string,
  calendarEventId: string,
): Promise<MeetingNote | null> {
  const email = normalizeEmail(userEmail)
  const eventId = normalizeEventId(calendarEventId)

  const { data, error } = await supabase
    .from('meeting_notes')
    .select(NOTES_SELECT)
    .eq('user_email', email)
    .eq('calendar_event_id', eventId)
    .maybeSingle()

  assertNoError(error, 'getNotesForEvent')
  return data ?? null
}

export async function saveNotesForEvent(
  userEmail: string,
  calendarEventId: string,
  eventSummary: string,
  notes: string,
): Promise<MeetingNote> {
  const email = normalizeEmail(userEmail)
  const eventId = normalizeEventId(calendarEventId)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('meeting_notes')
    .upsert(
      {
        user_email: email,
        calendar_event_id: eventId,
        event_summary: eventSummary.trim(),
        notes,
        updated_at: now,
      },
      { onConflict: 'user_email,calendar_event_id' },
    )
    .select(NOTES_SELECT)
    .single()

  assertNoError(error, 'saveNotesForEvent')
  if (!data) {
    throw new Error('saveNotesForEvent: upsert returned no row')
  }
  return data
}
