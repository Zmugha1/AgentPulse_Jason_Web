-- Market Intel: cached GA4 metrics per user and date range (6-hour TTL).
CREATE TABLE public.ga4_metrics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  range text NOT NULL,
  metrics_data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  CONSTRAINT ga4_metrics_cache_range_check
    CHECK (range IN ('last_7_days', 'last_30_days')),
  CONSTRAINT ga4_metrics_cache_user_range_unique
    UNIQUE (user_email, range)
);

CREATE INDEX ga4_metrics_cache_expires_at_idx
  ON public.ga4_metrics_cache (expires_at);

ALTER TABLE public.ga4_metrics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ga4_metrics_cache_select_own"
  ON public.ga4_metrics_cache
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "ga4_metrics_cache_insert_own"
  ON public.ga4_metrics_cache
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "ga4_metrics_cache_update_own"
  ON public.ga4_metrics_cache
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email)
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, INSERT, UPDATE ON public.ga4_metrics_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_metrics_cache TO service_role;
