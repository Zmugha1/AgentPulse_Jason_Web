import { useEffect, useState } from 'react'
import { AlertTriangle, Info, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  openLeadIntelligenceWithFilter,
  type MarketPulseLeadFilter,
} from '../lib/marketPulseFilter'

type MarketInsight = {
  headline: string
  body: string
  lead_filter: MarketPulseLeadFilter | null
  action: string
  is_warning?: boolean
}

type MarketPulsePanelProps = {
  reportId: string | null
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
}

const outlineButtonClass =
  'font-body text-sm text-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-teal hover:text-white transition-colors'

function MarketPulseInfoTip() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-flex items-start">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center justify-center p-1 rounded text-slate hover:text-navy focus:outline-none focus:ring-2 focus:ring-teal"
        aria-expanded={open}
        aria-label="How Market Pulse insights work"
      >
        <Info className="w-4 h-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-10 mt-2 w-72 sm:w-80 rounded-lg border border-mint bg-white p-3 shadow-sm">
          <p className="font-body text-xs text-slate leading-relaxed">
            Market Pulse compares your uploaded MLS numbers with live lead counts
            from Supabase. Insights only use real report stats and real pipeline
            totals. No invented market figures. Toggle Market Pulse off to pause
            generation without deleting your reports.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default function MarketPulsePanel({
  reportId,
  enabled,
  onEnabledChange,
}: MarketPulsePanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<MarketInsight[]>([])

  useEffect(() => {
    if (!enabled || !reportId) {
      setInsights([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadInsights() {
      setLoading(true)
      setError(null)
      setInsights([])

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
        const res = await fetch('/api/generate-market-insights', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ report_id: reportId }),
        })

        const payload = (await res.json()) as {
          insights?: MarketInsight[]
          message?: string
        }

        if (cancelled) return

        if (!res.ok) {
          setError(payload.message ?? 'Could not generate market insights')
          return
        }

        setInsights(Array.isArray(payload.insights) ? payload.insights : [])
      } catch {
        if (!cancelled) {
          setError('Could not generate market insights')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadInsights()
    return () => {
      cancelled = true
    }
  }, [reportId, enabled])

  return (
    <section className="bg-white border border-mint rounded-lg p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <h2 className="font-heading text-xl text-navy">Market Pulse</h2>
            <MarketPulseInfoTip />
          </div>
          <p className="font-body text-sm text-slate mt-1">
            Actions for your pipeline based on current market conditions.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`font-body text-xs ${
              enabled ? 'text-teal' : 'text-slate'
            }`}
          >
            Market Pulse
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle Market Pulse"
            onClick={() => onEnabledChange(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal ${
              enabled ? 'bg-teal' : 'bg-slate/40'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-4">
        {!enabled ? (
          <p className="font-body text-sm text-slate">
            Market Pulse is paused. Toggle on to generate pipeline insights from
            your report.
          </p>
        ) : null}

        {enabled && !reportId ? (
          <p className="font-body text-sm text-slate">
            Upload your MLS report above to see market-driven insights for your
            pipeline.
          </p>
        ) : null}

        {enabled && reportId && loading ? (
          <div className="flex items-center gap-2 text-slate py-4">
            <Loader2 className="w-4 h-4 animate-spin text-teal" aria-hidden />
            <p className="font-body text-sm">
              Analyzing your pipeline against current market conditions...
            </p>
          </div>
        ) : null}

        {enabled && reportId && !loading && error ? (
          <p className="font-body text-sm text-coral" role="alert">
            {error}
          </p>
        ) : null}

        {enabled &&
        reportId &&
        !loading &&
        !error &&
        insights.length === 0 ? (
          <p className="font-body text-sm text-slate">
            No actionable insights right now. Check back after your next report
            upload.
          </p>
        ) : null}

        {enabled && reportId && !loading && insights.length > 0 ? (
          <div className="space-y-4">
            {insights.map((insight, index) => {
              const isWarning = insight.is_warning === true
              return (
                <article
                  key={`${insight.headline}-${index}`}
                  className={`rounded-lg p-4 bg-cream/40 border border-mint ${
                    isWarning ? 'border-l-4 border-l-coral' : ''
                  }`}
                >
                  <h3 className="font-heading text-base font-bold text-navy flex items-start gap-2">
                    {isWarning ? (
                      <AlertTriangle
                        className="w-5 h-5 text-coral shrink-0 mt-0.5"
                        aria-hidden
                      />
                    ) : null}
                    <span>{insight.headline}</span>
                  </h3>
                  <p className="font-body text-sm text-slate mt-2 leading-relaxed">
                    {insight.body}
                  </p>
                  <p
                    className={`font-body text-sm italic mt-2 ${
                      isWarning ? 'text-coral' : 'text-teal'
                    }`}
                  >
                    {insight.action}
                  </p>
                  {!isWarning && insight.lead_filter ? (
                    <button
                      type="button"
                      className={`${outlineButtonClass} mt-3`}
                      onClick={() =>
                        openLeadIntelligenceWithFilter(insight.lead_filter!)
                      }
                    >
                      View These Leads
                    </button>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
