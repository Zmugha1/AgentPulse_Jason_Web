import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Loader2 } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import WeeklyActivitySummary from '../components/WeeklyActivitySummary'
import MarketPulsePanel from '../components/MarketPulsePanel'
import SourcePerformanceTable from '../components/SourcePerformanceTable'
import { getStageLabel } from '../lib/pipelineStages'
import {
  readShowMarketPulsePreference,
  writeShowMarketPulsePreference,
} from '../lib/marketPulseFilter'
import { supabase } from '../lib/supabase'
import {
  fetchWebsiteMetrics,
  getPoolHeadlineMetrics,
  getPricedLeadStats,
  getRecencyBuckets,
  getSourcePerformance,
  getStageDistribution,
  getTotalCounts,
  type MarketIntelResult,
  type MetricsRange,
  type SourcePerformanceRow,
  type TrafficSourceCategoryRow,
} from '../services/marketIntelService'

type MarketReportStats = {
  area?: string | null
  report_period?: string | null
  new_listings?: number | null
  new_listings_change_pct?: number | null
  closed_sales?: number | null
  closed_sales_change_pct?: number | null
  median_sales_price?: number | null
  median_sales_price_change_pct?: number | null
  pct_of_list_price?: number | null
  days_on_market?: number | null
  days_on_market_change_pct?: number | null
  inventory?: number | null
  inventory_change_pct?: number | null
  pending_sales?: number | null
  pending_sales_change_pct?: number | null
}

type ActiveMarketReport = {
  id: string
  area: string
  report_period: string
  extracted_stats: MarketReportStats
  raw_text: string
  uploaded_at: string
  is_active: boolean
  use_in_prompts: boolean
}

const CENTRAL_TZ = 'America/Chicago'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function getCentralWeekdayIndex(date: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    weekday: 'short',
  }).format(date)
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }
  return map[weekday] ?? 0
}

function getCentralYmd(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0'
    return Number(value)
  }
  return { year: read('year'), month: read('month'), day: read('day') }
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  }
}

function formatCentralYmd(
  ymd: { year: number; month: number; day: number },
  includeYear: boolean,
): string {
  const monthName = MONTH_NAMES[ymd.month - 1] ?? 'Unknown'
  if (includeYear) {
    return `${monthName} ${ymd.day}, ${ymd.year}`
  }
  return `${monthName} ${ymd.day}`
}

function getThisWeekSubtitle(now = new Date()): string {
  const weekdayIndex = getCentralWeekdayIndex(now)
  const today = getCentralYmd(now)
  const monday = addCalendarDays(
    today.year,
    today.month,
    today.day,
    -weekdayIndex,
  )
  const sunday = addCalendarDays(monday.year, monday.month, monday.day, 6)
  const sameYear = monday.year === sunday.year
  const mondayLabel = formatCentralYmd(monday, !sameYear)
  const sundayLabel = formatCentralYmd(sunday, true)
  return `Week of ${mondayLabel} -- ${sundayLabel}`
}

function formatPercent(count: number, total: number): string {
  if (!total) return '0.0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function IntelCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="bg-white border border-mint rounded-lg p-4 md:p-6">
      <h2 className="font-heading text-xl text-navy">{title}</h2>
      {subtitle ? (
        <p className="font-body text-sm text-slate mt-1">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  )
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

function formatUploadedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function buildReportStatLines(stats: MarketReportStats): string[] {
  const lines: string[] = []

  if (
    typeof stats.median_sales_price === 'number' &&
    Number.isFinite(stats.median_sales_price)
  ) {
    const change =
      typeof stats.median_sales_price_change_pct === 'number' &&
      Number.isFinite(stats.median_sales_price_change_pct)
        ? ` (${formatSignedPct(stats.median_sales_price_change_pct)})`
        : ''
    lines.push(`Median price ${formatCurrency(stats.median_sales_price)}${change}`)
  }

  if (
    typeof stats.closed_sales_change_pct === 'number' &&
    Number.isFinite(stats.closed_sales_change_pct)
  ) {
    const pct = Math.abs(Math.round(stats.closed_sales_change_pct * 10) / 10)
    const direction =
      stats.closed_sales_change_pct >= 0 ? 'up' : 'down'
    lines.push(`Closed sales ${direction} ${pct}%`)
  }

  if (
    typeof stats.days_on_market === 'number' &&
    Number.isFinite(stats.days_on_market)
  ) {
    const days = Math.round(stats.days_on_market)
    lines.push(`Homes selling in ${days} days`)
  }

  if (
    typeof stats.pct_of_list_price === 'number' &&
    Number.isFinite(stats.pct_of_list_price)
  ) {
    const pct = Math.round(stats.pct_of_list_price * 10) / 10
    lines.push(`Sellers getting ${pct}% of list price`)
  }

  return lines.slice(0, 4)
}

function MarketReportSection({
  onActiveReportsChange,
}: {
  onActiveReportsChange?: (reports: ActiveMarketReport[]) => void
}) {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [reports, setReports] = useState<ActiveMarketReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  const [replacingArea, setReplacingArea] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [pdfInputKey, setPdfInputKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const publishReports = useCallback(
    (next: ActiveMarketReport[]) => {
      setReports(next)
      onActiveReportsChange?.(next)
    },
    [onActiveReportsChange],
  )

  async function getAccessToken(): Promise<string | null> {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) return null
    return token
  }

  const loadActiveReports = useCallback(async () => {
    setLoading(true)
    setError(null)

    const token = await getAccessToken()
    if (!token) {
      publishReports([])
      setError('Please sign in again')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/get-active-market-report', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = (await res.json()) as {
        reports?: ActiveMarketReport[]
        message?: string
      }

      if (!res.ok) {
        publishReports([])
        setError(payload.message ?? 'Could not load market report')
        return
      }

      const next = (Array.isArray(payload.reports) ? payload.reports : []).map(
        (row) => ({
          ...row,
          use_in_prompts: row.use_in_prompts !== false,
        }),
      )
      publishReports(next)
      setShowUploader(next.length === 0)
    } catch {
      publishReports([])
      setError('Could not load market report')
    } finally {
      setLoading(false)
    }
  }, [publishReports])

  useEffect(() => {
    void loadActiveReports()
  }, [loadActiveReports])

  async function handlePdfSelect(file: File | null) {
    if (!file) return

    setError(null)

    if (file.type && file.type !== 'application/pdf') {
      setError('Please upload a PDF file')
      setPdfInputKey((k) => k + 1)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('PDF must be 5MB or smaller')
      setPdfInputKey((k) => k + 1)
      return
    }

    setUploading(true)

    const token = await getAccessToken()
    if (!token) {
      setError('Please sign in again')
      setUploading(false)
      setPdfInputKey((k) => k + 1)
      return
    }

    try {
      const formData = new FormData()
      formData.append('pdf', file)

      const res = await fetch('/api/extract-pdf-text', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const payload = (await res.json()) as {
        text?: string
        stats?: MarketReportStats
        report_id?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not extract text from PDF')
        setPdfInputKey((k) => k + 1)
        return
      }

      if (!payload.report_id || !payload.stats) {
        setError('Report was extracted but could not be stored')
        setPdfInputKey((k) => k + 1)
        return
      }

      const stats = payload.stats
      const area = stats.area?.trim() || ''
      const nextReport: ActiveMarketReport = {
        id: payload.report_id,
        area,
        report_period: stats.report_period?.trim() || '',
        extracted_stats: stats,
        raw_text: payload.text?.trim() ?? '',
        uploaded_at: new Date().toISOString(),
        is_active: true,
        use_in_prompts: true,
      }

      const withoutSameArea = reports.filter(
        (row) => row.area.trim().toLowerCase() !== area.toLowerCase(),
      )
      publishReports([nextReport, ...withoutSameArea])
      setShowUploader(false)
      setReplacingArea(null)
      setConfirmRemoveId(null)
      setPdfInputKey((k) => k + 1)
    } catch {
      setError('Could not extract text from PDF')
      setPdfInputKey((k) => k + 1)
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveReport(reportId: string) {
    setError(null)
    setRemovingId(reportId)

    const token = await getAccessToken()
    if (!token) {
      setError('Please sign in again')
      setRemovingId(null)
      return
    }

    try {
      const res = await fetch('/api/deactivate-market-report', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report_id: reportId }),
      })
      const payload = (await res.json()) as {
        success?: boolean
        message?: string
      }

      if (!res.ok || !payload.success) {
        setError(payload.message ?? 'Could not remove market report')
        return
      }

      const next = reports.filter((row) => row.id !== reportId)
      publishReports(next)
      setConfirmRemoveId(null)
      if (next.length === 0) setShowUploader(true)
    } catch {
      setError('Could not remove market report')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleTogglePrompts(
    reportId: string,
    useInPrompts: boolean,
  ) {
    setError(null)
    setTogglingId(reportId)

    const previous = reports
    publishReports(
      reports.map((row) =>
        row.id === reportId ? { ...row, use_in_prompts: useInPrompts } : row,
      ),
    )

    const token = await getAccessToken()
    if (!token) {
      publishReports(previous)
      setError('Please sign in again')
      setTogglingId(null)
      return
    }

    try {
      const res = await fetch('/api/toggle-market-report-prompts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          report_id: reportId,
          use_in_prompts: useInPrompts,
        }),
      })
      const payload = (await res.json()) as {
        success?: boolean
        use_in_prompts?: boolean
        message?: string
      }

      if (!res.ok || !payload.success) {
        publishReports(previous)
        setError(payload.message ?? 'Could not update report settings')
        return
      }

      publishReports(
        previous.map((row) =>
          row.id === reportId
            ? {
                ...row,
                use_in_prompts:
                  typeof payload.use_in_prompts === 'boolean'
                    ? payload.use_in_prompts
                    : useInPrompts,
              }
            : row,
        ),
      )
    } catch {
      publishReports(previous)
      setError('Could not update report settings')
    } finally {
      setTogglingId(null)
    }
  }

  const areaNames = reports
    .map((row) => row.area.trim() || row.extracted_stats.area?.trim() || '')
    .filter(Boolean)
  const summaryLabel =
    reports.length === 0
      ? ''
      : reports.length === 1
        ? `1 report loaded${areaNames[0] ? `: ${areaNames[0]}` : ''}`
        : `${reports.length} reports loaded: ${areaNames.join(', ')}`

  return (
    <section className="bg-white border border-mint rounded-lg p-4 md:p-6">
      <h2 className="font-heading text-xl text-navy">Market Intelligence</h2>
      <p className="font-body text-sm text-slate mt-1">
        Upload your monthly MLS report. AgentPulse extracts the data and uses it
        to power insights, lead actions, email drafts, and all content
        generation. You can keep one active report per market area.
      </p>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-slate">
            <Loader2 className="w-4 h-4 animate-spin text-teal" aria-hidden />
            <p className="font-body text-sm">Checking for active reports...</p>
          </div>
        ) : null}

        {!loading && reports.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Check
                className="w-5 h-5 text-teal shrink-0 mt-0.5"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm text-navy">{summaryLabel}</p>
                <p className="font-body text-xs text-slate/80 mt-1">
                  This data is used across AgentPulse for insights and content
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {reports.map((report) => {
                const areaLabel =
                  report.area?.trim() ||
                  report.extracted_stats.area?.trim() ||
                  'Unknown area'
                const periodLabel =
                  report.report_period?.trim() ||
                  report.extracted_stats.report_period?.trim() ||
                  ''
                const statLines = buildReportStatLines(
                  report.extracted_stats ?? {},
                )
                const useInPrompts = report.use_in_prompts !== false
                const isConfirmingRemove = confirmRemoveId === report.id
                const isRemoving = removingId === report.id
                const isToggling = togglingId === report.id

                return (
                  <div
                    key={report.id}
                    className="border border-mint rounded-lg p-4 bg-cream/40"
                  >
                    <p className="font-heading text-sm font-bold text-navy">
                      {areaLabel}
                      {periodLabel ? ` · ${periodLabel}` : ''}
                    </p>
                    {statLines.length > 0 ? (
                      <p className="font-body text-sm text-slate mt-2 leading-relaxed">
                        {statLines.join(' · ')}
                      </p>
                    ) : null}
                    <p className="font-body text-xs text-slate mt-2">
                      Last updated: {formatUploadedAt(report.uploaded_at)}
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={useInPrompts}
                        disabled={isToggling}
                        onClick={() =>
                          void handleTogglePrompts(report.id, !useInPrompts)
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal ${
                          useInPrompts ? 'bg-teal' : 'bg-slate/40'
                        } ${isToggling ? 'opacity-60' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            useInPrompts ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span
                        className={`font-body text-xs ${
                          useInPrompts ? 'text-teal' : 'text-slate'
                        }`}
                      >
                        {useInPrompts
                          ? 'Used in insights and content'
                          : 'Excluded from prompts'}
                      </span>
                    </div>

                    {isConfirmingRemove ? (
                      <div className="mt-3 space-y-2">
                        <p className="font-body text-xs text-slate">
                          Remove this report? It will no longer be used for
                          insights or content.
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={isRemoving}
                            onClick={() => setConfirmRemoveId(null)}
                            className="font-body text-xs text-slate underline hover:text-navy"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isRemoving}
                            onClick={() => void handleRemoveReport(report.id)}
                            className="font-body text-xs text-coral underline hover:text-navy"
                          >
                            {isRemoving ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => {
                            setReplacingArea(areaLabel)
                            setShowUploader(true)
                            setConfirmRemoveId(null)
                            setError(null)
                          }}
                          className="font-body text-xs text-slate underline hover:text-navy"
                        >
                          Replace {areaLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmRemoveId(report.id)
                            setError(null)
                          }}
                          className="font-body text-xs text-coral underline hover:text-navy"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {!showUploader ? (
              <button
                type="button"
                onClick={() => {
                  setReplacingArea(null)
                  setShowUploader(true)
                  setConfirmRemoveId(null)
                  setError(null)
                }}
                className="font-body text-xs text-teal underline hover:text-navy"
              >
                Add another market area
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && (showUploader || reports.length === 0) ? (
          <div className="space-y-3 mt-3">
            {uploading ? (
              <div className="flex items-center gap-2 text-slate">
                <Loader2 className="w-4 h-4 animate-spin text-teal" aria-hidden />
                <p className="font-body text-sm">Reading report...</p>
              </div>
            ) : (
              <>
                {replacingArea ? (
                  <p className="font-body text-xs text-slate">
                    Upload a PDF to replace {replacingArea}. Uploading a
                    different area will add or replace that area instead.
                  </p>
                ) : null}
                <input
                  key={pdfInputKey}
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    void handlePdfSelect(file)
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors"
                >
                  Upload MLS Report PDF
                </button>
                {reports.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploader(false)
                      setReplacingArea(null)
                      setError(null)
                    }}
                    className="font-body text-xs text-slate underline block"
                  >
                    Cancel
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="font-body text-sm text-coral mt-3" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

const WEBSITE_ACTIVITY_RANGE_OPTIONS: {
  value: MetricsRange
  label: string
}[] = [
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
]

function formatMinutesAgo(iso: string): string {
  if (!iso) return 'just now'
  const fetchedMs = new Date(iso).getTime()
  if (Number.isNaN(fetchedMs)) return 'just now'
  const minutes = Math.max(0, Math.floor((Date.now() - fetchedMs) / 60_000))
  if (minutes === 0) return 'just now'
  if (minutes === 1) return '1 minute ago'
  return `${minutes} minutes ago`
}

function truncatePageTitle(title: string, maxLength = 50): string {
  if (title.length <= maxLength) return title
  return `${title.slice(0, maxLength - 3)}...`
}

function WebsiteActivitySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="bg-cream border border-mint rounded-lg p-4 animate-pulse"
        >
          <div className="h-3 bg-mint/80 rounded w-28 mb-3" />
          <div className="h-8 bg-mint/80 rounded w-20 mb-2" />
          <div className="h-3 bg-mint/60 rounded w-36" />
        </div>
      ))}
    </div>
  )
}

function TrafficSourcesSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="bg-cream border border-mint rounded-lg p-4 animate-pulse"
        >
          <div className="h-4 bg-mint/80 rounded w-40 mb-3" />
          <div className="h-7 bg-mint/80 rounded w-16 mb-2" />
          <div className="h-3 bg-mint/60 rounded w-full mb-3" />
          <div className="h-2 bg-mint/50 rounded w-full" />
        </div>
      ))}
    </div>
  )
}

function trafficRangeLabel(range: MetricsRange): string {
  return range === 'last_30_days' ? '30' : '7'
}

function TrafficSourcesSection({
  range,
  loading,
  trafficSources,
}: {
  range: MetricsRange
  loading: boolean
  trafficSources: TrafficSourceCategoryRow[]
}) {
  const categorizedSessions = trafficSources.reduce(
    (sum, row) => sum + row.sessions,
    0,
  )
  const maxSessions = Math.max(
    ...trafficSources.map((row) => row.sessions),
    1,
  )

  return (
    <div className="mt-6 border-t border-mint pt-6">
      <h3 className="font-heading text-base text-navy">
        Where Your Visitors Come From
      </h3>
      <p className="font-label text-xs text-slate mt-1">
        Last {trafficRangeLabel(range)} days -- {formatCount(categorizedSessions)}{' '}
        sessions categorized
      </p>

      {loading ? (
        <TrafficSourcesSkeleton />
      ) : trafficSources.length === 0 || categorizedSessions === 0 ? (
        <p className="font-body text-sm text-slate mt-4">
          Not enough traffic data yet. Check back after your site has received
          more visitors.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {trafficSources.map((row) => (
            <div
              key={row.category}
              className="bg-cream border border-mint rounded-lg p-4"
            >
              <div className="font-heading text-base text-navy">
                {row.category}
              </div>
              <div className="font-body text-2xl font-bold text-teal mt-1">
                {formatCount(row.sessions)}
              </div>
              <p className="font-body text-[13px] text-slate mt-2 leading-relaxed">
                {row.suggested_action}
              </p>
              <div
                className="mt-3 h-2 rounded-full bg-mint overflow-hidden"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-teal"
                  style={{
                    width: `${Math.max(4, (row.sessions / maxSessions) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WebsiteMetricCard({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="bg-cream border border-mint rounded-lg p-4">
      <div className="font-label text-[10px] uppercase text-slate">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function WebsiteActivitySection() {
  const [range, setRange] = useState<MetricsRange>('last_30_days')
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<MarketIntelResult | null>(null)

  const loadMetrics = useCallback(async (selectedRange: MetricsRange) => {
    setLoading(true)
    try {
      const result = await fetchWebsiteMetrics(selectedRange)
      setMetrics(result)
    } catch {
      setMetrics({
        range: selectedRange,
        sessions: 0,
        users: 0,
        top_sources: [],
        top_pages: [],
        traffic_sources: [],
        lead_events: 0,
        lead_conversion_rate: 0,
        fetched_at: '',
        cached: false,
        error: 'internal_error',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMetrics(range)
  }, [loadMetrics, range])

  const error = metrics?.error
  const hasData = metrics && !error
  const noSessions = hasData && metrics.sessions === 0

  const topSource = metrics?.top_sources[0]
  const topSourceShare =
    hasData && topSource && metrics.sessions > 0
      ? ((topSource.sessions / metrics.sessions) * 100).toFixed(1)
      : null

  const topPages = (metrics?.top_pages ?? []).slice(0, 5)

  return (
    <section className="bg-white border border-mint rounded-lg p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <h2 className="font-heading text-xl text-navy">
          Website Activity - thesuepattigroup.ai
        </h2>
        <div className="flex flex-wrap gap-2">
          {WEBSITE_ACTIVITY_RANGE_OPTIONS.map((option) => {
            const selected = range === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`font-body text-sm rounded-full px-4 py-2 min-h-[44px] transition-colors ${
                  selected
                    ? 'bg-teal text-white'
                    : 'bg-cream text-slate hover:bg-mint/40'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <>
            <WebsiteActivitySkeleton />
            <TrafficSourcesSection
              range={range}
              loading
              trafficSources={[]}
            />
          </>
        ) : error === 'unauthenticated' ? (
          <p className="font-body text-sm text-coral">
            Please sign in again
          </p>
        ) : error === 'scope_insufficient' ? (
          <div className="space-y-2">
            <p className="font-body text-sm text-coral">
              Reconnect Google with Analytics permission
            </p>
            <a
              href="/integrations"
              className="font-body text-sm text-teal underline hover:opacity-90"
            >
              Open Integrations
            </a>
          </div>
        ) : error === 'property_not_found' ? (
          <p className="font-body text-sm text-coral">Configuration error</p>
        ) : error === 'internal_error' || error === 'invalid_request' ? (
          <div className="space-y-3">
            <p className="font-body text-sm text-coral">
              Could not load metrics
            </p>
            <button
              type="button"
              onClick={() => void loadMetrics(range)}
              className="font-body text-sm text-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-teal/10 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <WebsiteMetricCard label="Visitors">
                {noSessions ? (
                  <>
                    <div className="font-heading text-2xl font-bold text-slate">
                      —
                    </div>
                    <p className="font-body text-xs text-slate mt-1">
                      No sessions recorded for this period
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-heading text-3xl font-bold text-navy">
                      {formatCount(metrics!.users)}
                    </div>
                    <p className="font-body text-sm text-navy mt-1">Visitors</p>
                    <p className="font-body text-xs text-slate mt-1">
                      ({formatCount(metrics!.sessions)} sessions)
                    </p>
                  </>
                )}
              </WebsiteMetricCard>

              <WebsiteMetricCard label="Top Traffic Source">
                {noSessions || !topSource ? (
                  <>
                    <div className="font-heading text-2xl font-bold text-slate">
                      —
                    </div>
                    <p className="font-body text-xs text-slate mt-1">
                      No traffic source data for this period
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-heading text-xl font-bold text-navy">
                      {topSource.source}
                    </div>
                    <p className="font-body text-sm text-navy mt-1">
                      Top Traffic Source
                    </p>
                    <p className="font-body text-xs text-slate mt-1">
                      {topSourceShare}% of sessions
                    </p>
                  </>
                )}
              </WebsiteMetricCard>

              <WebsiteMetricCard label="Top Pages">
                {topPages.length === 0 ? (
                  <>
                    <div className="font-heading text-2xl font-bold text-slate">
                      —
                    </div>
                    <p className="font-body text-xs text-slate mt-1">
                      No page views for this period
                    </p>
                  </>
                ) : (
                  <ul className="space-y-2">
                    {topPages.map((page) => (
                      <li
                        key={`${page.page_path}-${page.page_title}`}
                        className="flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-body text-sm text-navy">
                            {truncatePageTitle(page.page_title)}
                          </p>
                          <p className="font-label text-[10px] text-slate truncate">
                            {page.page_path}
                          </p>
                        </div>
                        <span className="font-body text-sm text-teal shrink-0">
                          {formatCount(page.views)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </WebsiteMetricCard>

              <WebsiteMetricCard label="Lead Conversion Rate">
                {noSessions ? (
                  <>
                    <div className="font-heading text-2xl font-bold text-slate">
                      —
                    </div>
                    <p className="font-body text-xs text-slate mt-1">
                      No sessions to calculate conversion
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-heading text-3xl font-bold text-navy">
                      {metrics!.lead_conversion_rate.toFixed(1)}%
                    </div>
                    <p className="font-body text-sm text-navy mt-1">
                      Lead Conversion Rate
                    </p>
                    <p
                      className={`font-body text-xs mt-1 ${
                        metrics!.lead_events > 0
                          ? 'text-[#3A7D5C]'
                          : 'text-slate'
                      }`}
                    >
                      {formatCount(metrics!.lead_events)} leads captured from{' '}
                      {formatCount(metrics!.sessions)} sessions
                    </p>
                  </>
                )}
              </WebsiteMetricCard>
            </div>

            <TrafficSourcesSection
              range={range}
              loading={loading}
              trafficSources={metrics?.traffic_sources ?? []}
            />

            <p className="font-label text-xs text-slate mt-3 leading-relaxed">
              Conversion rate counts real form submissions (chatbot + seller
              valuation), not newsletter signups.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-body text-xs text-slate">
                Last updated: {formatMinutesAgo(metrics!.fetched_at)}
                {metrics!.cached ? (
                  <span className="ml-1">(cached)</span>
                ) : null}
              </p>
              <button
                type="button"
                onClick={() => void loadMetrics(range)}
                className="font-body text-sm text-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-teal/10 transition-colors"
              >
                Refresh
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export default function MarketIntel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeReportId, setActiveReportId] = useState<string | null>(null)
  const [activeReportsKey, setActiveReportsKey] = useState('none')
  const [showMarketPulse, setShowMarketPulse] = useState(() =>
    readShowMarketPulsePreference(true),
  )
  const [totals, setTotals] = useState<Awaited<
    ReturnType<typeof getTotalCounts>
  > | null>(null)
  const [headline, setHeadline] = useState<Awaited<
    ReturnType<typeof getPoolHeadlineMetrics>
  > | null>(null)
  const [sourcePerformance, setSourcePerformance] = useState<
    SourcePerformanceRow[] | null
  >(null)
  const [stages, setStages] = useState<Awaited<
    ReturnType<typeof getStageDistribution>
  > | null>(null)
  const [recency, setRecency] = useState<Awaited<
    ReturnType<typeof getRecencyBuckets>
  > | null>(null)
  const [pricedStats, setPricedStats] = useState<Awaited<
    ReturnType<typeof getPricedLeadStats>
  > | null>(null)

  const handleActiveReportsChange = useCallback(
    (reports: ActiveMarketReport[]) => {
      const promptEnabled = reports.filter((row) => row.use_in_prompts !== false)
      setActiveReportId(promptEnabled[0]?.id ?? reports[0]?.id ?? null)
      setActiveReportsKey(
        reports.length > 0
          ? [...reports]
              .map(
                (row) =>
                  `${row.id}:${row.use_in_prompts !== false ? '1' : '0'}`,
              )
              .sort()
              .join('|')
          : 'none',
      )
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [
          totalCounts,
          poolHeadline,
          sourcePerformanceRows,
          stageDistribution,
          recencyBuckets,
          priced,
        ] = await Promise.all([
          getTotalCounts(),
          getPoolHeadlineMetrics(),
          getSourcePerformance(),
          getStageDistribution(),
          getRecencyBuckets(),
          getPricedLeadStats(),
        ])
        if (cancelled) return
        setTotals(totalCounts)
        setHeadline(poolHeadline)
        setSourcePerformance(sourcePerformanceRows)
        setStages(stageDistribution)
        setRecency(recencyBuckets)
        setPricedStats(priced)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load market intel',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const stageChartData = useMemo(
    () =>
      (stages ?? []).map((row) => ({
        stage: getStageLabel(row.stage),
        count: row.count,
      })),
    [stages],
  )

  const pricedLeadPhrase = useMemo(() => {
    if (!pricedStats || pricedStats.total === 0) {
      return 'You currently have no priced leads.'
    }
    const noun =
      pricedStats.total === 1 ? 'priced lead' : 'priced leads'
    const allNew =
      pricedStats.newCount === pricedStats.total
        ? ', all new'
        : `, ${formatCount(pricedStats.newCount)} still new`
    return `You currently have ${formatCount(pricedStats.total)} ${noun}${allNew}.`
  }, [pricedStats])

  const intelUnavailable =
    Boolean(error) ||
    !totals ||
    !headline ||
    !sourcePerformance ||
    !stages ||
    !recency ||
    !pricedStats

  const poolTotal = totals?.total ?? 0

  return (
    <div className="space-y-6">
      <MarketReportSection onActiveReportsChange={handleActiveReportsChange} />
      <MarketPulsePanel
        key={activeReportsKey}
        reportId={activeReportId}
        enabled={showMarketPulse}
        onEnabledChange={(enabled) => {
          setShowMarketPulse(enabled)
          writeShowMarketPulsePreference(enabled)
        }}
      />

      {loading ? (
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          <p className="font-body text-navy">Loading market intel...</p>
        </div>
      ) : intelUnavailable ? (
        <div className="bg-white border border-mint rounded-lg p-6">
          <h2 className="font-heading text-xl text-navy">Market Intel unavailable</h2>
          <p className="font-body text-coral text-sm mt-2">
            {error ?? 'Data could not be loaded.'}
          </p>
        </div>
      ) : (
        <>
      <IntelCard title="This Week" subtitle={getThisWeekSubtitle()}>
        <WeeklyActivitySummary />
      </IntelCard>

      <section className="bg-white border border-mint rounded-lg p-6 md:p-8">
        <h2 className="font-heading text-2xl md:text-3xl text-navy">
          {formatCount(poolTotal)} leads in your active pool
        </h2>
        <p className="font-body text-base text-slate mt-2">
          {formatCount(headline.neverWorked12Months)} unworked from the last 12
          months, {formatCount(headline.warmCount)} warm overall,{' '}
          {formatCount(headline.closed)} closed.
        </p>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total leads',
            value: formatCount(poolTotal),
            sub: 'Active pool (excludes archived)',
          },
          {
            label: 'Never worked',
            value: formatCount(totals.new),
            sub: formatPercent(totals.new, poolTotal),
          },
          {
            label: 'Advanced',
            value: formatCount(totals.advanced),
            sub: formatPercent(totals.advanced, poolTotal),
          },
          {
            label: 'Closed',
            value: formatCount(totals.closed),
            sub: `${formatPercent(totals.closed, poolTotal)} close rate`,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-mint rounded-lg p-4"
          >
            <div className="font-label text-[10px] uppercase text-slate">
              {stat.label}
            </div>
            <div className="font-heading text-2xl font-bold text-navy mt-1">
              {stat.value}
            </div>
            <div className="font-body text-xs text-slate mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <IntelCard
        title="Where your leads come from"
        subtitle="Conversion performance by lead source"
      >
        <SourcePerformanceTable rows={sourcePerformance} />
      </IntelCard>

      <WebsiteActivitySection />

      <IntelCard title="Pipeline stage distribution">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stageChartData}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#C8E8E5" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="stage"
                width={160}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Bar dataKey="count" name="Leads" fill="#3BBFBF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </IntelCard>

      <IntelCard
        title="Lead age distribution"
        subtitle="Recent leads are your highest-converting recovery pool"
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={recency}
              margin={{ top: 10, right: 20, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#C8E8E5" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Leads" fill="#2D4459" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </IntelCard>

      <IntelCard title="Price band analysis">
        <p className="font-body text-sm text-navy leading-relaxed">
          Price band analysis activates once you&apos;ve worked enough priced
          leads to show conversion patterns. {pricedLeadPhrase} As more flow in
          from Realtor.com and the website, this chart will populate with
          meaningful advance rates.
        </p>
      </IntelCard>

      <p className="font-body text-xs text-slate leading-relaxed">
        These metrics describe your active pool of {formatCount(poolTotal)}{' '}
        non-archived leads. The historic archive of 2,152 leads showed a 62.8% never-worked
        rate; the curation rule removed 1,285 leads that were both old and never
        advanced.
      </p>
        </>
      )}
    </div>
  )
}
