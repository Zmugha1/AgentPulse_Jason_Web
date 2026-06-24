ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status_override text;
