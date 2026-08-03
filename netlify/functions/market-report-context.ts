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

function formatOneReportBlock(report: ActiveMarketReportRow): string {
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

  const lines = [`Area: ${area}`, `Period: ${period}`]

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

/**
 * Fetch all active MLS reports for the user.
 */
export async function fetchActiveMarketReports(
  supabase: SupabaseClient,
  userEmail: string,
): Promise<{
  reports: ActiveMarketReportRow[]
  errorMessage: string | null
}> {
  const { data, error } = await supabase
    .from('market_reports')
    .select('area, report_period, extracted_stats')
    .eq('user_email', userEmail)
    .eq('is_active', true)
    .eq('use_in_prompts', true)
    .order('uploaded_at', { ascending: false })

  if (error) {
    return { reports: [], errorMessage: error.message }
  }

  const reports: ActiveMarketReportRow[] = []
  for (const row of data ?? []) {
    const stats =
      row.extracted_stats &&
      typeof row.extracted_stats === 'object' &&
      !Array.isArray(row.extracted_stats)
        ? (row.extracted_stats as Record<string, unknown>)
        : null
    reports.push({
      area: typeof row.area === 'string' ? row.area : null,
      report_period:
        typeof row.report_period === 'string' ? row.report_period : null,
      extracted_stats: stats,
    })
  }

  return { reports, errorMessage: null }
}

/** @deprecated Prefer fetchActiveMarketReports. Returns the newest active report. */
export async function fetchActiveMarketReport(
  supabase: SupabaseClient,
  userEmail: string,
): Promise<{ report: ActiveMarketReportRow | null; errorMessage: string | null }> {
  const { reports, errorMessage } = await fetchActiveMarketReports(
    supabase,
    userEmail,
  )
  return { report: reports[0] ?? null, errorMessage }
}

/**
 * Prompt block with real MLS numbers only. Returns null when no reports.
 */
export function formatMarketContextForPrompt(
  reportOrReports: ActiveMarketReportRow | ActiveMarketReportRow[] | null,
): string | null {
  const reports = Array.isArray(reportOrReports)
    ? reportOrReports
    : reportOrReports
      ? [reportOrReports]
      : []
  if (reports.length === 0) return null

  const header =
    'Current market context (use these real numbers naturally in the message if relevant to this lead. Never invent statistics):'

  if (reports.length === 1) {
    return `${header}\n${formatOneReportBlock(reports[0])}`
  }

  const blocks = reports.map(
    (report, index) => `Report ${index + 1}:\n${formatOneReportBlock(report)}`,
  )
  return `${header}\n${blocks.join('\n\n')}`
}
