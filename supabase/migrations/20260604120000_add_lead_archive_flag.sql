-- Added 2026-06-04 for Jason's archive-not-delete ask from 6/2 meeting.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
