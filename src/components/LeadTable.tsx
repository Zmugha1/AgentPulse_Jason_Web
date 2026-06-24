import { useState } from 'react'
import type { Lead, LeadStatus } from '../lib/types'
import { supabase } from '../lib/supabase'
import { leadAgeDays } from '../services/scoringService'
import { getStageLabel } from '../lib/pipelineStages'
import LeadActionButtons from './LeadActionButtons'
import LeadPurposeEditor from './LeadPurposeEditor'
import LeadStageEditor from './LeadStageEditor'
import SourceBadge from './SourceBadge'
import StatusPill from './StatusPill'
import { isStale } from '../lib/leadStale'

/** Score DESC, then original_lead_date ASC (oldest first). Matches Morning Brief. */
export function sortLeadsByScoreThenDate(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const scoreA = a.score ?? -1
    const scoreB = b.score ?? -1
    if (scoreB !== scoreA) return scoreB - scoreA

    const dateA = a.original_lead_date
      ? new Date(a.original_lead_date).getTime()
      : Number.MAX_SAFE_INTEGER
    const dateB = b.original_lead_date
      ? new Date(b.original_lead_date).getTime()
      : Number.MAX_SAFE_INTEGER
    return dateA - dateB
  })
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Unknown'
}

function formatDate(value: string | null): string {
  if (!value) return 'no date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatLastContact(lead: Lead): string {
  if (!lead.last_contact_at) return 'never'
  return formatDate(lead.last_contact_at)
}

function formatDaysSinceArrival(lead: Lead): string {
  const days = leadAgeDays(lead)
  if (days === null) return 'unknown'
  return `${Math.round(days)}d`
}

function hasUsablePhone(phone: string | null): boolean {
  return Boolean(phone && phone.replace(/\D/g, '').length >= 10)
}

function hasUsableEmail(email: string | null): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
}

function stageStyles(stage: string | null): string {
  const value = (stage ?? 'new').toLowerCase()
  if (value === 'dead' || value === 'closed') {
    return 'bg-slate/15 text-slate'
  }
  if (value === 'new') {
    return 'bg-slate/10 text-navy'
  }
  return 'bg-teal/15 text-navy'
}

function StageBadge({ stage }: { stage: string | null }) {
  const value = stage ?? 'new'
  const label = getStageLabel(value)
  return (
    <span
      className={`font-label rounded px-2 py-0.5 text-[10px] ${stageStyles(stage)}`}
    >
      {label}
    </span>
  )
}

function ArchivedBadge() {
  return (
    <span className="font-label rounded px-2 py-0.5 text-[10px] uppercase bg-slate/15 text-slate">
      Archived
    </span>
  )
}

function StaleBadge() {
  return (
    <span className="font-label rounded px-2 py-0.5 text-[10px] uppercase bg-slate/15 text-slate border border-slate/30">
      Stale
    </span>
  )
}

function ContactCell({ lead }: { lead: Lead }) {
  const phoneOk = hasUsablePhone(lead.phone)
  const emailOk = hasUsableEmail(lead.email)
  return (
    <div className="font-body text-sm text-navy space-y-0.5">
      <div className={phoneOk ? '' : 'text-slate/70'}>
        {lead.phone || 'no phone'}
      </div>
      <div className={`text-xs ${emailOk ? 'text-slate' : 'text-slate/70'}`}>
        {lead.email || 'no email'}
      </div>
    </div>
  )
}

type LeadTableProps = {
  leads: Lead[]
  showArchived: boolean
  onLeadUpdated?: (lead: Lead) => void
  onArchive?: (leadId: string) => Promise<void>
  onUnarchive?: (leadId: string) => Promise<void>
}

export default function LeadTable({
  leads,
  showArchived,
  onLeadUpdated,
  onArchive,
  onUnarchive,
}: LeadTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  async function handleStatusOverride(
    leadId: string,
    status: LeadStatus | null,
  ) {
    if (!onLeadUpdated || busyId) return

    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return

    const previous = lead
    const optimistic: Lead = {
      ...lead,
      status_override: status,
      updated_at: new Date().toISOString(),
    }

    setOverrideError(null)
    setBusyId(leadId)
    onLeadUpdated(optimistic)

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const userEmail = sessionData.session?.user?.email
    if (sessionError || !token || !userEmail) {
      onLeadUpdated(previous)
      setOverrideError('Please sign in again')
      setBusyId(null)
      return
    }

    try {
      const res = await fetch('/api/update-lead-status-override', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: leadId,
          status_override: status,
          user_email: userEmail,
        }),
      })

      const payload = (await res.json()) as {
        status_override?: LeadStatus | null
        message?: string
      }

      if (!res.ok) {
        onLeadUpdated(previous)
        setOverrideError(payload.message ?? 'Could not update status')
        return
      }

      onLeadUpdated({
        ...optimistic,
        status_override: payload.status_override ?? status,
      })
    } catch {
      onLeadUpdated(previous)
      setOverrideError('Could not update status')
    } finally {
      setBusyId(null)
    }
  }

  async function handleArchive(leadId: string) {
    if (!onArchive || busyId) return
    setBusyId(leadId)
    try {
      await onArchive(leadId)
    } finally {
      setBusyId(null)
    }
  }

  async function handleUnarchive(leadId: string) {
    if (!onUnarchive || busyId) return
    setBusyId(leadId)
    try {
      await onUnarchive(leadId)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-mint overflow-hidden bg-white">
      {overrideError ? (
        <p className="font-body text-coral text-xs px-3 py-2" role="alert">
          {overrideError}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1024px] border-collapse font-body text-sm">
          <thead>
            <tr className="bg-navy text-white font-heading text-left">
              <th className="px-3 py-2 font-normal">Name</th>
              <th className="px-3 py-2 font-normal">Contact</th>
              <th className="px-3 py-2 font-normal">Source</th>
              <th className="px-3 py-2 font-normal">Stage</th>
              <th className="px-3 py-2 font-normal text-right font-label">
                Score
              </th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal">Lead date</th>
              <th className="px-3 py-2 font-normal">Last contact</th>
              <th className="px-3 py-2 font-normal text-right font-label">
                Days in
              </th>
              {(onArchive || onUnarchive) && (
                <th className="px-3 py-2 font-normal text-right">Archive</th>
              )}
              {onLeadUpdated && (
                <th className="px-3 py-2 font-normal text-right">Quick actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const isArchived = lead.is_archived
              const rowBusy = busyId === lead.id
              const stale = isStale(lead)
              return (
                <tr
                  key={lead.id}
                  className={`border-t border-mint/60 hover:bg-cream/50 transition-opacity duration-300 ${
                    rowBusy ? 'opacity-50' : stale ? 'opacity-60' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-navy align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{displayName(lead)}</span>
                      {isArchived && <ArchivedBadge />}
                    </div>
                    {onLeadUpdated && (
                      <LeadPurposeEditor
                        lead={lead}
                        onUpdated={onLeadUpdated}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ContactCell lead={lead} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <SourceBadge source={lead.source} size="sm" />
                      {stale ? <StaleBadge /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {onLeadUpdated ? (
                      <LeadStageEditor lead={lead} onUpdated={onLeadUpdated} />
                    ) : (
                      <StageBadge stage={lead.pipeline_stage} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-label text-navy">
                    {lead.score ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {onLeadUpdated ? (
                      <StatusPill
                        lead={lead}
                        onOverride={(id, status) =>
                          void handleStatusOverride(id, status)
                        }
                      />
                    ) : (
                      <StatusPill lead={lead} readonly />
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate text-xs">
                    {formatDate(lead.original_lead_date)}
                  </td>
                  <td className="px-3 py-2 text-slate text-xs">
                    {formatLastContact(lead)}
                  </td>
                  <td className="px-3 py-2 text-right font-label text-slate text-xs">
                    {formatDaysSinceArrival(lead)}
                  </td>
                  {(onArchive || onUnarchive) && (
                    <td className="px-3 py-2 text-right align-top">
                      {isArchived && showArchived && onUnarchive ? (
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => handleUnarchive(lead.id)}
                          className="font-label text-xs text-teal hover:text-navy disabled:opacity-50 min-h-[44px] min-w-[44px] px-2"
                        >
                          Unarchive
                        </button>
                      ) : null}
                      {!isArchived && onArchive ? (
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => handleArchive(lead.id)}
                          className="font-label text-xs text-slate hover:text-navy disabled:opacity-50 min-h-[44px] min-w-[44px] px-2"
                          title="Archive this lead"
                        >
                          Archive
                        </button>
                      ) : null}
                    </td>
                  )}
                  {onLeadUpdated && (
                    <td className="px-3 py-2 text-right align-top">
                      {!isArchived ? (
                        <LeadActionButtons
                          lead={lead}
                          onLeadUpdated={onLeadUpdated}
                          disabled={rowBusy}
                        />
                      ) : null}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
