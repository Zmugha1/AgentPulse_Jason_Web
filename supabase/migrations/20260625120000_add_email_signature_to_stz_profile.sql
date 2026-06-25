ALTER TABLE public.stz_profile
  ADD COLUMN IF NOT EXISTS email_signature text;
