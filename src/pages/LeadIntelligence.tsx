import { useCallback, useEffect, useMemo, useState } from 'react'
import AddLeadModal from '../components/AddLeadModal'
import LeadFilters, { type LeadFiltersState } from '../components/LeadFilters'
import LeadTable from '../components/LeadTable'
import type { Lead } from '../lib/types'
import { matchesSourceFilter } from '../lib/leadSources'
import { isStale } from '../lib/leadStale'
import { leadAgeDays } from '../services/scoringService'
import {
  archiveLead,
  getAllLeads,
  getLeadsCount,
  unarchiveLead,
} from '../services/leadsService'

const defaultFilters: LeadFiltersState = {
  search: '',
  status: 'all',
  pipelineStage: 'all',
  source: 'all',
}

export type LeadSortBy =
  | 'score_desc'
  | 'date_desc'
  | 'date_asc'
  | 'last_contact_desc'
  | 'days_in_pipeline_desc'

function leadDateMs(lead: Lead): number {
  if (!lead.original_lead_date) return 0
  const t = new Date(lead.original_lead_date).getTime()
  return Number.isNaN(t) ? 0 : t
}

function lastContactMs(lead: Lead): number {
  if (!lead.last_contact_at) return 0
  const t = new Date(lead.last_contact_at).getTime()
  return Number.isNaN(t) ? 0 : t
}

export function sortLeads(leads: Lead[], sortBy: LeadSortBy): Lead[] {
  return [...leads].sort((a, b) => {
    switch (sortBy) {
      case 'score_desc': {
        const scoreA = a.score ?? -1
        const scoreB = b.score ?? -1
        if (scoreB !== scoreA) return scoreB - scoreA
        return leadDateMs(b) - leadDateMs(a)
      }
      case 'date_desc':
        return leadDateMs(b) - leadDateMs(a)
      case 'date_asc':
        return leadDateMs(a) - leadDateMs(b)
      case 'last_contact_desc':
        return lastContactMs(b) - lastContactMs(a)
      case 'days_in_pipeline_desc': {
        const ageA = leadAgeDays(a) ?? -1
        const ageB = leadAgeDays(b) ?? -1
        return ageB - ageA
      }
      default:
        return 0
    }
  })
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
  if (!matchesSourceFilter(lead.source, filters.source)) {
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
  const [totalInDb, setTotalInDb] = useState(0)
  const [archivedCount, setArchivedCount] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<LeadFiltersState>(defaultFilters)
  const [sortBy, setSortBy] = useState<LeadSortBy>('score_desc')
  const [hideStale, setHideStale] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const refreshCounts = useCallback(async () => {
    const [all, active] = await Promise.all([
      getLeadsCount(true),
      getLeadsCount(false),
    ])
    setTotalInDb(all)
    setArchivedCount(all - active)
  }, [])

  const loadLeads = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows] = await Promise.all([
        getAllLeads(showArchived),
        refreshCounts(),
      ])
      setLeads(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [showArchived, refreshCounts])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [rows, all, active] = await Promise.all([
          getAllLeads(showArchived),
          getLeadsCount(true),
          getLeadsCount(false),
        ])
        if (!cancelled) {
          setLeads(rows)
          setTotalInDb(all)
          setArchivedCount(all - active)
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
  }, [showArchived])

  const filtered = useMemo(() => {
    let matches = leads.filter((lead) => matchesFilters(lead, filters))
    if (hideStale) {
      matches = matches.filter((lead) => !isStale(lead))
    }
    return sortLeads(matches, sortBy)
  }, [leads, filters, sortBy, hideStale])

  const activePoolTotal = totalInDb - archivedCount

  const counterText = useMemo(() => {
    const poolTotal = showArchived ? totalInDb : activePoolTotal
    const base = `Showing ${filtered.length} of ${poolTotal} leads`
    if (!showArchived && archivedCount > 0) {
      return `${base} (${archivedCount} archived hidden)`
    }
    return base
  }, [
    filtered.length,
    showArchived,
    totalInDb,
    activePoolTotal,
    archivedCount,
  ])

  function showToast(message: string) {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(null), 4000)
  }

  async function handleArchive(leadId: string) {
    const updated = await archiveLead(leadId)
    await refreshCounts()
    if (showArchived) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? updated : l)),
      )
    } else {
      setLeads((prev) => prev.filter((l) => l.id !== leadId))
    }
    showToast('Lead archived. Toggle "Show archived leads" to view.')
  }

  async function handleUnarchive(leadId: string) {
    const updated = await unarchiveLead(leadId)
    await refreshCounts()
    if (showArchived) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? updated : l)),
      )
    } else {
      setLeads((prev) => [...prev, updated])
    }
    showToast('Lead restored to your active list.')
  }

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
        <button
          type="button"
          onClick={() => loadLeads()}
          className="mt-3 font-label text-sm text-teal hover:text-navy"
        >
          Retry
        </button>
      </div>
    )
  }

  async function handleLeadAdded(lead: Lead) {
    await refreshCounts()
    setLeads((prev) => [...prev, lead])
    showToast('Lead added')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="font-body text-sm text-white bg-teal border-2 border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors"
        >
          + Add Lead
        </button>
      </div>

      <AddLeadModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleLeadAdded}
      />

      <LeadFilters
        filters={filters}
        onChange={setFilters}
        sortBy={sortBy}
        onSortChange={setSortBy}
        hideStale={hideStale}
        onHideStaleChange={setHideStale}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 font-body text-sm text-navy cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-mint text-teal focus:ring-teal"
          />
          Show archived leads
        </label>
        {statusMessage ? (
          <p
            className="font-body text-sm text-teal bg-mint/40 border border-mint rounded px-3 py-1.5"
            role="status"
          >
            {statusMessage}
          </p>
        ) : null}
      </div>

      <p className="font-label text-xs text-slate">{counterText}</p>

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
          showArchived={showArchived}
          onLeadUpdated={(updated) => {
            setLeads((prev) =>
              prev.map((l) => (l.id === updated.id ? updated : l)),
            )
          }}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
        />
      )}
    </div>
  )
}
