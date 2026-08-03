-- Per-report control: keep a report active for reference but exclude it from prompts.
ALTER TABLE public.market_reports
  ADD COLUMN IF NOT EXISTS use_in_prompts boolean NOT NULL DEFAULT true;
