-- Service role needs table grants for seed scripts (matches leads pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stz_profile TO service_role;
