-- Allow multiple active market reports per user, one per area.
-- Deactivation is scoped by area in extract-pdf-text (same user_email + area).

CREATE UNIQUE INDEX IF NOT EXISTS market_reports_one_active_per_area_idx
  ON public.market_reports (user_email, area)
  WHERE is_active = true;
