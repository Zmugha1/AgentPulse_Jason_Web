-- Phase 7a-extended: cached AI research briefs per calendar attendee.
CREATE TABLE public.research_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  calendar_event_id text NOT NULL,
  attendee_email text NOT NULL,
  brief_content jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT research_briefs_user_event_attendee_unique
    UNIQUE (user_email, calendar_event_id, attendee_email)
);

CREATE INDEX research_briefs_user_event_idx
  ON public.research_briefs (user_email, calendar_event_id);

CREATE INDEX research_briefs_expires_at_idx
  ON public.research_briefs (expires_at);

ALTER TABLE public.research_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_briefs_select_own"
  ON public.research_briefs
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "research_briefs_insert_own"
  ON public.research_briefs
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "research_briefs_update_own"
  ON public.research_briefs
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email)
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, INSERT, UPDATE ON public.research_briefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_briefs TO service_role;
