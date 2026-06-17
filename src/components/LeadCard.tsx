import { useState } from 'react'
import type { Lead, LeadStatus } from '../lib/types'
import { leadAgeDays } from '../services/scoringService'
import ActionButtons, { BRIEF_ACTIONS, type BriefAction } from './ActionButtons'
import { logInteraction } from '../services/interactionsService'
import { updateLeadStage } from '../services/leadsService'

const STAGE_BY_OUTCOME: Record<string, string> = {
  called: 'contacted',
  emailed: 'contacted',
  voicemail: 'attempted',
  not_interested: 'attempted',
  no_answer: 'attempted',
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Unknown'
}

function daysSinceContact(lead: Lead): number | null {
  if (!lead.last_contact_at) return null
  const d = new Date(lead.last_contact_at)
  if (Number.isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

function formatSource(source: string | null): string {
  if (!source) return 'unknown'
  if (source === 'realtor_com_full') return 'realtor full'
  if (source === 'realtor_com_contacts') return 'realtor contacts'
  return source
}

function briefReason(lead: Lead): string {
  const parts: string[] = []
  const age = leadAgeDays(lead)
  const gap = daysSinceContact(lead)
  const price = lead.budget_max ?? lead.listing_price

  if (!lead.last_contact_at || gap === null) {
    parts.push('never contacted')
  } else if (gap > 7) {
    parts.push(`not contacted in ${Math.round(gap)} days`)
  }

  if (age === null) {
    parts.push('unknown lead date')
  } else {
    parts.push(`${Math.round(age)} days old`)
  }

  if (price === null || price === undefined) {
    parts.push('no price data')
  }

  if ((lead.pipeline_stage ?? 'new') !== 'new') {
    parts.push(`stage: ${lead.pipeline_stage}`)
  }

  return parts.length ? parts.join(', ') : 'active pipeline lead'
}

function statusBorderClass(status: string | null): string {
  const value = (status ?? 'cold') as LeadStatus
  if (value === 'hot') return 'border-coral'
  if (value === 'warm') return 'border-gold'
  return 'border-slate'
}

function statusTextClass(status: string | null): string {
  const value = (status ?? 'cold') as LeadStatus
  if (value === 'hot') return 'text-coral'
  if (value === 'warm') return 'text-gold'
  return 'text-slate'
}

type LeadCardProps = {
  lead: Lead
  onActionComplete: (leadId: string) => void
}

export default function LeadCard({ lead, onActionComplete }: LeadCardProps) {
  const [fading, setFading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(actionKey: BriefAction) {
    const action = BRIEF_ACTIONS.find((a) => a.key === actionKey)
    if (!action) return

    setBusy(true)
    setError(null)
    try {
      await logInteraction(lead.id, action.type, action.outcome)
      const stage = STAGE_BY_OUTCOME[action.outcome]
      if (stage) {
        await updateLeadStage(lead.id, stage)
      }
      setFading(true)
      window.setTimeout(() => onActionComplete(lead.id), 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
      setBusy(false)
    }
  }

  return (
    <article
      className={`bg-white rounded-lg border-2 p-4 transition-opacity duration-300 ${statusBorderClass(lead.status)} ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-heading text-xl text-navy">{displayName(lead)}</h3>
          <p className="font-body text-sm text-slate mt-1">{briefReason(lead)}</p>
          {lead.purpose?.trim() ? (
            <p className="font-body text-xs text-slate mt-1">
              <span className="text-slate">Purpose:</span>{' '}
              <span className="text-navy">{lead.purpose}</span>
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <div
            className={`font-label text-3xl font-bold ${statusTextClass(lead.status)}`}
          >
            {lead.score ?? 0}
          </div>
          <div className="font-label text-xs uppercase text-slate">
            {(lead.status ?? 'cold').toUpperCase()}
          </div>
        </div>
      </div>

      <div className="font-body text-sm text-navy space-y-1 mb-4">
        <p>{lead.phone || 'no phone'} · {lead.email || 'no email'}</p>
        <p className="text-slate">
          {formatSource(lead.source)} · {lead.pipeline_stage ?? 'new'}
        </p>
      </div>

      <ActionButtons disabled={busy || fading} onAction={handleAction} />

      {error && (
        <p className="font-body text-coral text-xs mt-2" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}
