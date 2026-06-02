/** Supabase-aligned types for AgentPulse web (Phase 2). */

export type LeadStatus = 'hot' | 'warm' | 'cold'

export type PipelineStage =
  | 'new'
  | 'contacted'
  | 'attempted'
  | 'nurture'
  | 'appointment'
  | 'showing'
  | 'offer'
  | 'closed'
  | 'dead'
  | string

export interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  zip: string | null
  source: string | null
  original_lead_date: string | null
  last_contact_at: string | null
  pipeline_stage: string | null
  score: number | null
  status: string | null
  has_home_to_sell: boolean | null
  buying_or_renting: string | null
  lender_status: string | null
  budget_max: number | null
  listing_price: number | null
  created_at: string | null
  updated_at: string | null
}

export interface Interaction {
  id: string
  lead_id: string
  type: string | null
  outcome: string | null
  notes: string | null
  created_at: string | null
}

export interface StageNote {
  id: string
  lead_id: string
  stage: string | null
  note_text: string | null
  created_at: string | null
}

export interface Source {
  id: string
  name: string | null
  is_active: boolean | null
}

export interface ScoringResult {
  score: number
  status: LeadStatus
}

export interface LeadWithNotes extends Lead {
  notes: StageNote[]
}

export interface MarketIntelSummary {
  total: number
  contacted: number
  new: number
  advanced: number
  closed: number
}

export interface PriceBandRow {
  band: string
  count: number
  advanceRate: number
}

export interface SourceBreakdown {
  zillow: number
  realtor_full: number
  realtor_contacts: number
  realtor_connections_plus: number
}

export interface PoolHeadlineMetrics {
  total: number
  neverWorked12Months: number
  warmCount: number
  closed: number
}

export interface StageDistributionRow {
  stage: string
  count: number
}

export interface RecencyBucketRow {
  bucket: string
  count: number
}
