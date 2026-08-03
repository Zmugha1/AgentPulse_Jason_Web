import type { SupabaseClient } from '@supabase/supabase-js'

export type ActiveMarketReportRow = {
  area: string | null
  report_period: string | null
  extracted_stats: Record<string, unknown> | null
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s,]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatSignedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}

/**
 * Fetch the user's active MLS report, if any.
 * Returns null when missing or on lookup failure (caller may log).
 */
export async function fetchActiveMarketReport(
  supabase: SupabaseClient,
  userEmail: string,
): Promise<{ report: ActiveMarketReportRow | null; errorMessage: string | null }> {
  const { data, error } = await supabase
    .from('market_reports')
    .select('area, report_period, extracted_stats')
    .eq('user_email', userEmail)
    .eq('is_active', true)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { report: null, errorMessage: error.message }
  }
  if (!data) {
    return { report: null, errorMessage: null }
  }

  const stats =
    data.extracted_stats &&
    typeof data.extracted_stats === 'object' &&
    !Array.isArray(data.extracted_stats)
      ? (data.extracted_stats as Record<string, unknown>)
      : null

  return {
    report: {
      area: typeof data.area === 'string' ? data.area : null,
      report_period:
        typeof data.report_period === 'string' ? data.report_period : null,
      extracted_stats: stats,
    },
    errorMessage: null,
  }
}

/**
 * Prompt block with real MLS numbers only. Returns null when no report.
 */
export function formatMarketContextForPrompt(
  report: ActiveMarketReportRow | null,
): string | null {
  if (!report) return null

  const stats = report.extracted_stats ?? {}
  const area =
    (typeof report.area === 'string' && report.area.trim()) ||
    (typeof stats.area === 'string' && stats.area.trim()) ||
    'Unknown'
  const period =
    (typeof report.report_period === 'string' && report.report_period.trim()) ||
    (typeof stats.report_period === 'string' && stats.report_period.trim()) ||
    'Unknown'

  const median = asFiniteNumber(stats.median_sales_price)
  const medianChange = asFiniteNumber(stats.median_sales_price_change_pct)
  const daysOnMarket = asFiniteNumber(stats.days_on_market)
  const pctOfList = asFiniteNumber(stats.pct_of_list_price)
  const closedChange = asFiniteNumber(stats.closed_sales_change_pct)

  const lines = [
    'Current market context (use these real numbers naturally in the message if relevant to this lead. Never invent statistics):',
    `Area: ${area}`,
    `Period: ${period}`,
  ]

  if (median !== null) {
    const change =
      medianChange !== null ? ` (${formatSignedPct(medianChange)})` : ''
    lines.push(`Median sales price: ${formatCurrency(median)}${change}`)
  }
  if (daysOnMarket !== null) {
    lines.push(`Homes selling in ${Math.round(daysOnMarket)} days`)
  }
  if (pctOfList !== null) {
    lines.push(
      `Sellers receiving ${Math.round(pctOfList * 10) / 10}% of list price`,
    )
  }
  if (closedChange !== null) {
    lines.push(`Closed sales ${formatSignedPct(closedChange)} vs last year`)
  }

  return lines.join('\n')
}
