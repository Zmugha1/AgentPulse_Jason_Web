-- Phase 3 prep: closing context captured when Jason marks We Closed.
CREATE TABLE public.closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads (id),
  user_email text NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closing_price numeric(12, 2),
  days_to_close integer,
  source text,
  interactions_count integer,
  market_report_id uuid REFERENCES public.market_reports (id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX closings_user_email_idx ON public.closings (user_email);
CREATE INDEX closings_lead_id_idx ON public.closings (lead_id);

ALTER TABLE public.closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closings_select_own"
  ON public.closings
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "closings_insert_own"
  ON public.closings
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, INSERT ON public.closings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closings TO service_role;
