-- Added 2026-06-03 for Jason's "what was their goal" ask from 6/2 meeting.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS purpose text;
