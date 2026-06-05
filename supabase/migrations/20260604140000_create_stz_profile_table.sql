-- Added 2026-06-04 for Jason's STZ profile per BNI transcript seeding work.
CREATE TABLE public.stz_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  q1_1 text,
  q1_2 text,
  q1_3 text,
  q1_4 text,
  q1_5 text,
  q2_1 text,
  q2_2 text,
  q2_3 text,
  q2_4 text,
  q2_5 text,
  q3_1 text,
  q3_2 text,
  q3_3 text,
  q3_4 text,
  q3_5 text,
  q4_1 text,
  q4_2 text,
  q4_3 text,
  q4_4 text,
  q4_5 text,
  q5_1 text,
  q5_2 text,
  q5_3 text,
  q5_4 text,
  q5_5 text,
  answer_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stz_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stz_profile_select_own"
  ON public.stz_profile
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "stz_profile_insert_own"
  ON public.stz_profile
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

CREATE POLICY "stz_profile_update_own"
  ON public.stz_profile
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = user_email)
  WITH CHECK ((auth.jwt() ->> 'email') = user_email);

GRANT SELECT, INSERT, UPDATE ON public.stz_profile TO authenticated;
