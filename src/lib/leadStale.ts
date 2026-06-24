import type { Lead } from './types'
import { leadAgeDays } from '../services/scoringService'

/** Stale: cold, 365+ days old, never contacted, still at stage new. */
export function isStale(lead: Lead): boolean {
  const score = lead.score ?? 0
  if (score > 3) return false

  const ageDays = leadAgeDays(lead)
  if (ageDays === null || ageDays <= 365) return false

  if (lead.last_contact_at) return false

  return (lead.pipeline_stage ?? 'new') === 'new'
}
