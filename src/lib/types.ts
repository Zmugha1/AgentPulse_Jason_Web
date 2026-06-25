/** Supabase-aligned types for AgentPulse web (Phase 2). */

import type { StzAnswerSource, StzQuestionId } from './stz-questions'

export type LeadStatus = 'hot' | 'warm' | 'cold' | 'dead'

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

/** Fields collected by the manual add-lead form (Phase 5 Part 3). */
export interface AddLeadInput {
  first_name: string
  last_name: string
  phone?: string | null
  email?: string | null
  pipeline_stage?: string
  purpose?: string | null
  budget_max?: number | null
  has_home_to_sell?: boolean
  address?: string | null
  zip?: string | null
  original_lead_date?: string | null
}

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
  status_override?: string | null
  has_home_to_sell: boolean | null
  buying_or_renting: string | null
  lender_status: string | null
  budget_max: number | null
  listing_price: number | null
  purpose: string | null
  is_archived: boolean
  created_at: string | null
  updated_at: string | null
}

export function getEffectiveStatus(lead: Lead): LeadStatus {
  const raw = lead.status_override ?? lead.status ?? 'cold'
  if (raw === 'hot' || raw === 'warm' || raw === 'cold' || raw === 'dead') {
    return raw
  }
  return 'cold'
}

export interface StzProfile {
  id: string
  user_email: string
  q1_1: string | null
  q1_2: string | null
  q1_3: string | null
  q1_4: string | null
  q1_5: string | null
  q2_1: string | null
  q2_2: string | null
  q2_3: string | null
  q2_4: string | null
  q2_5: string | null
  q3_1: string | null
  q3_2: string | null
  q3_3: string | null
  q3_4: string | null
  q3_5: string | null
  q4_1: string | null
  q4_2: string | null
  q4_3: string | null
  q4_4: string | null
  q4_5: string | null
  q5_1: string | null
  q5_2: string | null
  q5_3: string | null
  q5_4: string | null
  q5_5: string | null
  answer_sources: Partial<Record<StzQuestionId, StzAnswerSource>>
  email_signature: string | null
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
