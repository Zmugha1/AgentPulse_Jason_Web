/** Display-layer mapping for lead `source` values (DB values unchanged). */

const SLATE_BADGE = '#7A8F95'

export const LEAD_SOURCE_MAP: Record<string, string> = {
  zillow: 'Zillow',
  realtor_com_full: 'Realtor.com',
  realtor_contacts: 'Realtor.com',
  realtor_com_connections_plus: 'Realtor.com',
  'realtor.com': 'Realtor.com',
  website_chatbot: 'Website Chatbot',
  website_valuation: 'Website Valuation',
  website_newsletter: 'Website Newsletter',
  website_ai_referral: 'AI Referral',
  referral_bni: 'BNI Referral',
  referral_past_client: 'Past Client',
  open_house: 'Open House',
  manual: 'Manual Entry',
}

export const LEAD_SOURCE_BADGE_COLORS: Record<string, string> = {
  Zillow: '#C8974A',
  'Realtor.com': '#F05F57',
  'Website Chatbot': '#3BBFBF',
  'Website Valuation': '#3BBFBF',
  'Website Newsletter': '#3BBFBF',
  'AI Referral': '#7B5EA7',
  'BNI Referral': '#2D4459',
  'Past Client': '#3A7D5C',
  'Open House': SLATE_BADGE,
  'Manual Entry': SLATE_BADGE,
  Other: SLATE_BADGE,
}

export const LEAD_SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'zillow', label: 'Zillow' },
  { value: 'realtor.com', label: 'Realtor.com' },
  { value: 'website_chatbot', label: 'Website Chatbot' },
  { value: 'website_valuation', label: 'Website Valuation' },
  { value: 'website_newsletter', label: 'Website Newsletter' },
  { value: 'website_ai_referral', label: 'AI Referral' },
  { value: 'referral_bni', label: 'BNI Referral' },
  { value: 'referral_past_client', label: 'Past Client' },
  { value: 'open_house', label: 'Open House' },
  { value: 'manual', label: 'Manual Entry' },
]

function normalizeRawSource(raw: string): string {
  return raw.trim().toLowerCase()
}

export function getSourceLabel(raw: string): string {
  if (!raw.trim()) return 'Other'
  return LEAD_SOURCE_MAP[normalizeRawSource(raw)] ?? 'Other'
}

export function getSourceBadgeColor(raw: string): string {
  const label = getSourceLabel(raw)
  return LEAD_SOURCE_BADGE_COLORS[label] ?? SLATE_BADGE
}

export function matchesSourceFilter(
  leadSource: string | null,
  filterValue: string,
): boolean {
  if (filterValue === 'all') return true

  const filterKey = normalizeRawSource(filterValue)
  const leadKey = normalizeRawSource(leadSource ?? '')

  if (filterKey === 'realtor.com') {
    return getSourceLabel(leadSource ?? '') === 'Realtor.com'
  }

  if (LEAD_SOURCE_MAP[filterKey]) {
    return leadKey === filterKey
  }

  return false
}
