-- Market Intelligence: single source of truth for uploaded MLS reports.
CREATE TABLE public.market_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  area text NOT NULL DEFAULT '',
  report_period text NOT NULL DEFAULT '',
  extracted_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text text NOT NULL DEFAULT '',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX market_reports_user_email_active_idx
  ON public.market_reports (user_email, is_active);

ALTER TABLE public.market_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_reports_select_own"
  ON public.market_reports
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "market_reports_insert_own"
  ON public.market_reports
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "market_reports_update_own"
  ON public.market_reports
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email)
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, INSERT, UPDATE ON public.market_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_reports TO service_role;
