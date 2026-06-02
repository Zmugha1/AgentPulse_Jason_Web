import { useCallback, useEffect, useState } from 'react'
import LeadCard from '../components/LeadCard'
import type { Lead } from '../lib/types'
import { getMorningBriefLeads } from '../services/morningBriefService'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function MorningBrief() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await getMorningBriefLeads(20)
      setLeads(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleActionComplete(leadId: string) {
    setLeads((current) => current.filter((lead) => lead.id !== leadId))
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          <p className="font-body text-navy">Loading your morning brief...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-mint rounded-lg p-6">
        <p className="font-body text-coral">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="bg-white border border-mint rounded-lg p-6">
        <h2 className="font-heading text-2xl text-navy">{getGreeting()}</h2>
        <p className="font-body text-sm text-slate mt-1">{formatToday()}</p>
        <p className="font-body text-navy mt-3">
          Today&apos;s top leads worth your time
        </p>
        <p className="font-label text-xs text-slate mt-2">
          Showing {leads.length} leads to work today
        </p>
      </header>

      {leads.length === 0 ? (
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          <p className="font-body text-navy">No leads in your brief right now.</p>
          <p className="font-body text-sm text-slate mt-2">
            Check back later or review Lead Intelligence for the full list.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onActionComplete={handleActionComplete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
