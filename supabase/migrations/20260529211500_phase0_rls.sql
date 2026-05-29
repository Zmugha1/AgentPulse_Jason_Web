-- Phase 0: RLS and authenticated read/write policies

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

-- leads
CREATE POLICY "authenticated_select_leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_leads"
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_leads"
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- stage_notes
CREATE POLICY "authenticated_select_stage_notes"
  ON public.stage_notes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_stage_notes"
  ON public.stage_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_stage_notes"
  ON public.stage_notes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- interactions
CREATE POLICY "authenticated_select_interactions"
  ON public.interactions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_interactions"
  ON public.interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_interactions"
  ON public.interactions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- sources
CREATE POLICY "authenticated_select_sources"
  ON public.sources
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_sources"
  ON public.sources
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_sources"
  ON public.sources
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
