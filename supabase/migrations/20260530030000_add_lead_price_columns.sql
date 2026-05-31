-- Phase 2: price fields for scoring (nullable on historic curated load)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS budget_max numeric,
  ADD COLUMN IF NOT EXISTS listing_price numeric;
