/** Market Pulse → Lead Intelligence filter handoff (no react-router). */

export const MARKET_PULSE_FILTER_KEY = 'agentpulse_market_pulse_filter'
export const OPEN_LEAD_INTELLIGENCE_EVENT = 'agentpulse:open-lead-intelligence'

export type MarketPulseLeadFilter = {
  status: Array<'hot' | 'warm' | 'cold'> | null
  has_home_to_sell: boolean | null
  pipeline_stage: string | null
  never_contacted: boolean | null
  stale: boolean | null
}

export function isMarketPulseLeadFilter(
  value: unknown,
): value is MarketPulseLeadFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  if (obj.status !== null && !Array.isArray(obj.status)) return false
  if (
    obj.has_home_to_sell !== null &&
    typeof obj.has_home_to_sell !== 'boolean'
  ) {
    return false
  }
  if (obj.pipeline_stage !== null && typeof obj.pipeline_stage !== 'string') {
    return false
  }
  if (
    obj.never_contacted !== null &&
    typeof obj.never_contacted !== 'boolean'
  ) {
    return false
  }
  if (obj.stale !== null && typeof obj.stale !== 'boolean') return false
  return true
}

export function openLeadIntelligenceWithFilter(
  filter: MarketPulseLeadFilter,
): void {
  sessionStorage.setItem(MARKET_PULSE_FILTER_KEY, JSON.stringify(filter))
  window.dispatchEvent(new CustomEvent(OPEN_LEAD_INTELLIGENCE_EVENT))
}

export function readMarketPulseFilterFromStorage(): MarketPulseLeadFilter | null {
  const raw = sessionStorage.getItem(MARKET_PULSE_FILTER_KEY)
  if (!raw) return null
  sessionStorage.removeItem(MARKET_PULSE_FILTER_KEY)
  try {
    const parsed: unknown = JSON.parse(raw)
    return isMarketPulseLeadFilter(parsed) ? parsed : null
  } catch {
    return null
  }
}
