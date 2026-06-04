import { useEffect, useMemo, useState } from 'react'
import LeadFilters, { type LeadFiltersState } from '../components/LeadFilters'
import LeadTable, { sortLeadsByScoreThenDate } from '../components/LeadTable'
import type { Lead } from '../lib/types'
import { getAllLeads } from '../services/leadsService'

const TOTAL_LEADS = 867

const defaultFilters: LeadFiltersState = {
  search: '',
  status: 'all',
  pipelineStage: 'all',
  source: 'all',
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || ''
}

function matchesFilters(lead: Lead, filters: LeadFiltersState): boolean {
  if (filters.status !== 'all' && (lead.status ?? '') !== filters.status) {
    return false
  }
  if (
    filters.pipelineStage !== 'all' &&
    (lead.pipeline_stage ?? '') !== filters.pipelineStage
  ) {
    return false
  }
  if (filters.source !== 'all' && (lead.source ?? '') !== filters.source) {
    return false
  }

  const q = filters.search.trim().toLowerCase()
  if (q) {
    const hay = [
      displayName(lead),
      lead.first_name,
      lead.last_name,
      lead.email,
      lead.phone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }

  return true
}

export default function LeadIntelligence() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<LeadFiltersState>(defaultFilters)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const rows = await getAllLeads()
        if (!cancelled) {
          setLeads(sortLeadsByScoreThenDate(rows))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load leads')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const matches = leads.filter((lead) => matchesFilters(lead, filters))
    return sortLeadsByScoreThenDate(matches)
  }, [leads, filters])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          <p className="font-body text-navy">Loading leads...</p>
          <p className="font-label text-xs text-slate mt-2">Fetching from Supabase</p>
        </div>
        <div className="animate-pulse bg-white border border-mint rounded-lg h-48" />
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
    <div className="space-y-4">
      <LeadFilters filters={filters} onChange={setFilters} />

      <p className="font-label text-xs text-slate">
        Showing {filtered.length} of {TOTAL_LEADS} leads
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white border border-mint rounded-lg p-8 text-center">
          <p className="font-body text-navy">No leads match these filters.</p>
          <p className="font-body text-sm text-slate mt-2">
            Try clearing one or more filters to see more results.
          </p>
        </div>
      ) : (
        <LeadTable
        leads={filtered}
        onLeadUpdated={(updated) => {
          setLeads((prev) =>
            sortLeadsByScoreThenDate(
              prev.map((l) => (l.id === updated.id ? updated : l)),
            ),
          )
        }}
      />
      )}
    </div>
  )
}
