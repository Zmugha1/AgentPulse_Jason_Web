-- Phase 6: track imported Netlify Form submissions (poller idempotency).
CREATE TABLE public.website_lead_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  netlify_submission_id text NOT NULL,
  netlify_form_name text NOT NULL,
  lead_id uuid REFERENCES public.leads (id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  submission_created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'imported',
  error_message text,
  CONSTRAINT website_lead_submissions_netlify_submission_id_unique
    UNIQUE (netlify_submission_id),
  CONSTRAINT website_lead_submissions_status_check
    CHECK (
      status IN (
        'imported',
        'skipped_duplicate_email',
        'skipped_invalid',
        'error'
      )
    )
);

CREATE INDEX website_lead_submissions_netlify_form_name_idx
  ON public.website_lead_submissions (netlify_form_name);

CREATE INDEX website_lead_submissions_imported_at_idx
  ON public.website_lead_submissions (imported_at);

CREATE INDEX website_lead_submissions_lead_id_idx
  ON public.website_lead_submissions (lead_id);

-- RLS intentionally disabled: admin/system table; poller uses service role only.
GRANT SELECT, INSERT, UPDATE ON public.website_lead_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_lead_submissions TO service_role;
