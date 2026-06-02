import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  getPoolHeadlineMetrics,
  getPricedLeadStats,
  getRecencyBuckets,
  getSourceBreakdown,
  getStageDistribution,
  getTotalCounts,
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
            sub: 'Active operational pool',
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
        These metrics describe your operational pool of {formatCount(poolTotal)}{' '}
        leads. The historic archive of 2,152 leads showed a 62.8% never-worked
        rate; the curation rule removed 1,285 leads that were both old and never
        advanced.
      </p>
    </div>
  )
}
