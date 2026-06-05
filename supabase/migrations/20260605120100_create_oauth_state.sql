-- Phase 6 Part 3: CSRF state tokens for Google OAuth start/callback flow.
CREATE TABLE public.oauth_state (
  state_token text PRIMARY KEY,
  user_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oauth_state_created_at_idx
  ON public.oauth_state (created_at);

ALTER TABLE public.oauth_state ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: only service role (Netlify functions) may access.
GRANT SELECT, INSERT, DELETE ON public.oauth_state TO service_role;
