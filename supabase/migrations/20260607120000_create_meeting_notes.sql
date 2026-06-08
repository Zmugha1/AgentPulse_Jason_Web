-- Phase 7a-extended: meeting prep notes keyed by Google Calendar event id.
CREATE TABLE public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  calendar_event_id text NOT NULL,
  event_summary text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_notes_user_event_unique UNIQUE (user_email, calendar_event_id)
);

CREATE INDEX meeting_notes_user_email_idx
  ON public.meeting_notes (user_email);

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_notes_select_own"
  ON public.meeting_notes
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "meeting_notes_insert_own"
  ON public.meeting_notes
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "meeting_notes_update_own"
  ON public.meeting_notes
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email)
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, INSERT, UPDATE ON public.meeting_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_notes TO service_role;
