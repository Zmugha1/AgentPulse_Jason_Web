import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { supabase } from '../lib/supabase'

type WeekMetrics = {
  new_leads: number
  leads_worked: number
  stages_advanced: number
  realtor_response_rate: number | null
  deals_closed: number
}

type WeeklyActivityData = {
  this_week: WeekMetrics
  last_week: WeekMetrics
  week_start: string
  generated_at: string
}

type MetricKey = keyof WeekMetrics

type MetricCardConfig = {
  key: MetricKey
  label: string
  accentClass: string
  isRate?: boolean
}

const METRIC_CARDS: MetricCardConfig[] = [
  { key: 'new_leads', label: 'New Leads In', accentClass: 'border-teal' },
  { key: 'leads_worked', label: 'Leads Worked', accentClass: 'border-navy' },
  {
    key: 'stages_advanced',
    label: 'Stages Advanced',
    accentClass: 'border-gold',
  },
  {
    key: 'realtor_response_rate',
    label: 'Realtor.com Response',
    accentClass: 'border-coral',
    isRate: true,
  },
  {
    key: 'deals_closed',
    label: 'Deals Closed',
    accentClass: 'border-[#3A7D5C]',
  },
]

function formatMetricValue(value: number | null, isRate: boolean): string {
  if (isRate && value === null) return 'N/A'
  if (isRate && typeof value === 'number') return `${value.toFixed(1)}%`
  return String(value ?? 0)
}

function isFullyEmpty(data: WeeklyActivityData): boolean {
  const weeks = [data.this_week, data.last_week]
  return weeks.every(
    (week) =>
      week.new_leads === 0 &&
      week.leads_worked === 0 &&
      week.stages_advanced === 0 &&
      week.deals_closed === 0 &&
      (week.realtor_response_rate === null || week.realtor_response_rate === 0),
  )
}

function ComparisonIndicator({
  thisWeek,
  lastWeek,
  isRate,
}: {
  thisWeek: number | null
  lastWeek: number | null
  isRate?: boolean
}) {
  if (isRate && (thisWeek === null || lastWeek === null)) {
    return (
      <span className="font-body text-xs text-slate">
        {lastWeek === null ? 'No Realtor.com leads last week' : '— last week'}
      </span>
    )
  }

  const current = thisWeek ?? 0
  const previous = lastWeek ?? 0

  if (current > previous) {
    return (
      <span className="inline-flex items-center gap-1 font-body text-xs text-[#3A7D5C]">
        <ArrowUp className="w-3 h-3 shrink-0" aria-hidden />
        <span className="text-slate">{formatMetricValue(previous, Boolean(isRate))}</span>
      </span>
    )
  }

  if (current < previous) {
    return (
      <span className="inline-flex items-center gap-1 font-body text-xs text-coral">
        <ArrowDown className="w-3 h-3 shrink-0" aria-hidden />
        <span className="text-slate">{formatMetricValue(previous, Boolean(isRate))}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 font-body text-xs text-slate">
      <Minus className="w-3 h-3 shrink-0" aria-hidden />
      <span>{formatMetricValue(previous, Boolean(isRate))}</span>
    </span>
  )
}

function WeeklyActivitySkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="bg-cream border border-mint rounded-lg p-4 animate-pulse"
        >
          <div className="h-2.5 bg-mint/80 rounded w-20 mb-3" />
          <div className="h-8 bg-mint/80 rounded w-12 mb-2" />
          <div className="h-3 bg-mint/60 rounded w-16" />
        </div>
      ))}
    </div>
  )
}

function MetricCard({
  label,
  accentClass,
  thisWeek,
  lastWeek,
  isRate,
}: {
  label: string
  accentClass: string
  thisWeek: number | null
  lastWeek: number | null
  isRate?: boolean
}) {
  return (
    <div
      className={`bg-cream border border-mint border-t-4 ${accentClass} rounded-lg p-4 min-w-0`}
    >
      <div className="font-label text-[10px] uppercase text-slate tracking-wide">
        {label}
      </div>
      <div className="font-body text-[28px] font-bold text-navy mt-2 leading-none">
        {formatMetricValue(thisWeek, Boolean(isRate))}
      </div>
      <div className="mt-2">
        <ComparisonIndicator
          thisWeek={thisWeek}
          lastWeek={lastWeek}
          isRate={isRate}
        />
      </div>
    </div>
  )
}

export default function WeeklyActivitySummary() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<WeeklyActivityData | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (sessionError || !token) {
        if (!cancelled) {
          setError('Please sign in again')
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/fetch-weekly-activity', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        const body = (await res.json()) as WeeklyActivityData & {
          message?: string
        }

        if (!res.ok) {
          if (!cancelled) {
            setError(body.message ?? 'Could not load weekly activity')
          }
          return
        }

        if (!cancelled) {
          setData(body)
        }
      } catch {
        if (!cancelled) {
          setError('Could not load weekly activity')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <WeeklyActivitySkeleton />
  }

  if (error) {
    return (
      <p className="font-body text-sm text-coral" role="alert">
        {error}
      </p>
    )
  }

  if (!data) {
    return (
      <p className="font-body text-sm text-slate">
        Weekly activity unavailable
      </p>
    )
  }

  if (isFullyEmpty(data)) {
    return (
      <p className="font-body text-sm text-slate">
        Start working leads to see your weekly activity summary here.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {METRIC_CARDS.map((card) => (
        <MetricCard
          key={card.key}
          label={card.label}
          accentClass={card.accentClass}
          thisWeek={data.this_week[card.key]}
          lastWeek={data.last_week[card.key]}
          isRate={card.isRate}
        />
      ))}
    </div>
  )
}
