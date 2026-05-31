-- Grant table privileges to authenticated role (RLS policies already exist)

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stage_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.interactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sources TO authenticated;
