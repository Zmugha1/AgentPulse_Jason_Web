-- Phase 6 Part 3: encrypted Google OAuth tokens per AgentPulse user.
CREATE TABLE public.google_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  google_email text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes_granted text[] NOT NULL DEFAULT '{}'::text[],
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_oauth_tokens_user_google_unique UNIQUE (user_email, google_email)
);

CREATE INDEX google_oauth_tokens_user_email_idx
  ON public.google_oauth_tokens (user_email);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_oauth_tokens_select_own"
  ON public.google_oauth_tokens
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "google_oauth_tokens_delete_own"
  ON public.google_oauth_tokens
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, DELETE ON public.google_oauth_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_oauth_tokens TO service_role;
