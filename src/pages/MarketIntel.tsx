import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SourceBreakdown } from '../lib/types'
import {
  fetchWebsiteMetrics,
  getPoolHeadlineMetrics,
  getPricedLeadStats,
  getRecencyBuckets,
  getSourceBreakdown,
  getStageDistribution,
  getTotalCounts,
  type MarketIntelResult,
  type MetricsRange,
} from '../services/marketIntelService'

const CHART_COLORS = ['#2D4459', '#3BBFBF', '#F05F57', '#D4A017', '#C8E8E5']

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  attempted: 'Attempted',
  nurture: 'Nurture',
  appointment: 'Appointment',
  showing: 'Showing',
  offer: 'Offer',
  closed: 'Closed',
  dead: 'Dead',
}

function formatPercent(count: number, total: number): string {
  if (!total) return '0.0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function sourceChartData(sources: SourceBreakdown) {
  return [
    { name: 'Zillow', count: sources.zillow },
    { name: 'Realtor full', count: sources.realtor_full },
    { name: 'Realtor contacts', count: sources.realtor_contacts },
    {
      name: 'Realtor Connections Plus',
      count: sources.realtor_connections_plus,
    },
  ].filter((row) => row.count > 0)
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
  const [range, setRange] = useState<MetricsRange>('last_7_days')
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

  const topPages = (metrics?.top_pages ?? []).slice(0, 3)

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
          <WebsiteActivitySkeleton />
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
                          <p className="font-body text-sm text-navy truncate">
                            {page.page_title}
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
                    <p className="font-body text-xs text-slate mt-1">
                      {formatCount(metrics!.lead_events)} leads from{' '}
                      {formatCount(metrics!.sessions)} sessions
                    </p>
                  </>
                )}
              </WebsiteMetricCard>
            </div>

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
  const [totals, setTotals] = useState<Awaited<
    ReturnType<typeof getTotalCounts>
  > | null>(null)
  const [headline, setHeadline] = useState<Awaited<
    ReturnType<typeof getPoolHeadlineMetrics>
  > | null>(null)
  const [sources, setSources] = useState<SourceBreakdown | null>(null)
  const [stages, setStages] = useState<Awaited<
    ReturnType<typeof getStageDistribution>
  > | null>(null)
  const [recency, setRecency] = useState<Awaited<
    ReturnType<typeof getRecencyBuckets>
  > | null>(null)
  const [pricedStats, setPricedStats] = useState<Awaited<
    ReturnType<typeof getPricedLeadStats>
  > | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [
          totalCounts,
          poolHeadline,
          sourceBreakdown,
          stageDistribution,
          recencyBuckets,
          priced,
        ] = await Promise.all([
          getTotalCounts(),
          getPoolHeadlineMetrics(),
          getSourceBreakdown(),
          getStageDistribution(),
          getRecencyBuckets(),
          getPricedLeadStats(),
        ])
        if (cancelled) return
        setTotals(totalCounts)
        setHeadline(poolHeadline)
        setSources(sourceBreakdown)
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
        stage: STAGE_LABELS[row.stage] ?? row.stage,
        count: row.count,
      })),
    [stages],
  )

  const sourceData = useMemo(
    () => (sources ? sourceChartData(sources) : []),
    [sources],
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

  if (loading) {
    return (
      <div className="bg-white border border-mint rounded-lg p-8 text-center">
        <p className="font-body text-navy">Loading market intel...</p>
      </div>
    )
  }

  if (
    error ||
    !totals ||
    !headline ||
    !sources ||
    !stages ||
    !recency ||
    !pricedStats
  ) {
    return (
      <div className="bg-white border border-mint rounded-lg p-6">
        <h2 className="font-heading text-xl text-navy">Market Intel unavailable</h2>
        <p className="font-body text-coral text-sm mt-2">
          {error ?? 'Data could not be loaded.'}
        </p>
      </div>
    )
  }

  const poolTotal = totals.total

  return (
    <div className="space-y-6">
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
        subtitle="Website source flows live once Phase 6 integration ships"
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sourceData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(props) => {
                  const name = props.name ?? ''
                  const value =
                    typeof props.value === 'number' ? props.value : 0
                  return `${name}: ${value}`
                }}
              >
                {sourceData.map((_, index) => (
                  <Cell
                    key={sourceData[index].name}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatCount(Number(value)), 'Leads']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
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
                width={110}
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
    </div>
  )
}
