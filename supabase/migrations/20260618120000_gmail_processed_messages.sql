-- Phase 7b: idempotency for Gmail lead notification scans.
CREATE TABLE public.gmail_processed_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  processed_at timestamptz NOT NULL DEFAULT now(),
  lead_created boolean NOT NULL DEFAULT false,
  skip_reason text
);

CREATE INDEX gmail_processed_messages_processed_at_idx
  ON public.gmail_processed_messages (processed_at);

ALTER TABLE public.gmail_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail_processed_messages_select_authenticated"
  ON public.gmail_processed_messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gmail_processed_messages_insert_authenticated"
  ON public.gmail_processed_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.gmail_processed_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.gmail_processed_messages TO service_role;
