-- Phase 0: core tables (leads, stage_notes, interactions, sources)

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  phone text,
  address text,
  zip text,
  source text,
  original_lead_date timestamptz,
  last_contact_at timestamptz,
  pipeline_stage text,
  score integer,
  status text,
  has_home_to_sell boolean,
  buying_or_renting text,
  lender_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.stage_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads (id),
  stage text,
  note_text text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads (id),
  type text,
  outcome text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  is_active boolean DEFAULT true
);
