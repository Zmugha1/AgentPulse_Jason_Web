import { useCallback, useEffect, useMemo, useState } from 'react'
import AddLeadModal from '../components/AddLeadModal'
import LeadFilters, { type LeadFiltersState } from '../components/LeadFilters'
import LeadTable, { sortLeadsByScoreThenDate } from '../components/LeadTable'
import type { Lead } from '../lib/types'
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
  const [totalInDb, setTotalInDb] = useState(0)
  const [archivedCount, setArchivedCount] = useState(0)
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<LeadFiltersState>(defaultFilters)
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
      setLeads(sortLeadsByScoreThenDate(rows))
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
          setLeads(sortLeadsByScoreThenDate(rows))
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
    const matches = leads.filter((lead) => matchesFilters(lead, filters))
    return sortLeadsByScoreThenDate(matches)
  }, [leads, filters])

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
        sortLeadsByScoreThenDate(
          prev.map((l) => (l.id === leadId ? updated : l)),
        ),
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
        sortLeadsByScoreThenDate(
          prev.map((l) => (l.id === leadId ? updated : l)),
        ),
      )
    } else {
      setLeads((prev) =>
        sortLeadsByScoreThenDate([...prev, updated]),
      )
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
    setLeads((prev) => sortLeadsByScoreThenDate([...prev, lead]))
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

      <LeadFilters filters={filters} onChange={setFilters} />

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
              sortLeadsByScoreThenDate(
                prev.map((l) => (l.id === updated.id ? updated : l)),
              ),
            )
          }}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
        />
      )}
    </div>
  )
}
