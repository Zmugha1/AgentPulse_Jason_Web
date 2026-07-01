import { useState } from 'react'
import { getEffectiveStatus, type Lead, type LeadStatus } from '../lib/types'
import { leadAgeDays } from '../services/scoringService'
import { getStageLabel } from '../lib/pipelineStages'
import { logInteraction } from '../services/interactionsService'
import { archiveLead, updateLeadStage } from '../services/leadsService'
import SmsModal from './SmsModal'
import EmailModal from './EmailModal'
import CallScriptModal from './CallScriptModal'
import LeadEnrichmentModal from './LeadEnrichmentModal'
import DoneMenu from './DoneMenu'

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
    parts.push(`stage: ${getStageLabel(lead.pipeline_stage ?? 'new')}`)
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
  const [callOpen, setCallOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [findMoreOpen, setFindMoreOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)

  const actionDisabled = busy || fading

  function completeAction() {
    setFading(true)
    window.setTimeout(() => onActionComplete(lead.id), 300)
  }

  async function runLoggedAction(action: () => Promise<void>) {
    if (actionDisabled) return

    setBusy(true)
    setError(null)
    try {
      await action()
      completeAction()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
      setBusy(false)
    }
  }

  async function handleCallOutcome(
    outcome: 'called' | 'voicemail' | 'no_answer',
  ) {
    const stage = outcome === 'called' ? 'contacted' : 'attempted'
    await runLoggedAction(async () => {
      await logInteraction(lead.id, 'call', outcome)
      await updateLeadStage(lead.id, stage)
    })
  }

  async function handleSmsOutcome(outcome: 'texted' | 'not_sent') {
    if (outcome === 'not_sent') return
    await runLoggedAction(async () => {
      await logInteraction(lead.id, 'sms', 'texted')
      await updateLeadStage(lead.id, 'contacted')
    })
  }

  async function handleEmailOutcome(outcome: 'emailed' | 'not_sent') {
    if (outcome === 'not_sent') return
    await runLoggedAction(async () => {
      await logInteraction(lead.id, 'email', 'emailed')
      await updateLeadStage(lead.id, 'contacted')
    })
  }

  async function handleNotInterested() {
    await runLoggedAction(async () => {
      await logInteraction(lead.id, 'contact', 'not_interested')
      await updateLeadStage(lead.id, 'nurture')
    })
  }

  async function handleClosed() {
    await runLoggedAction(async () => {
      await updateLeadStage(lead.id, 'closed')
    })
  }

  async function handleArchive() {
    if (actionDisabled) return

    setBusy(true)
    setError(null)
    try {
      await archiveLead(lead.id)
      completeAction()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed')
      setBusy(false)
    }
  }

  return (
    <article
      className={`bg-white rounded-lg border-2 p-4 transition-opacity duration-300 ${statusBorderClass(getEffectiveStatus(lead))} ${fading ? 'opacity-0' : 'opacity-100'}`}
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
            className={`font-label text-3xl font-bold ${statusTextClass(getEffectiveStatus(lead))}`}
          >
            {lead.score ?? 0}
          </div>
          <div className="font-label text-xs uppercase text-slate">
            {getEffectiveStatus(lead).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="font-body text-sm text-navy space-y-1 mb-4">
        <p>{lead.phone || 'no phone'} · {lead.email || 'no email'}</p>
        <p className="text-slate">
          {formatSource(lead.source)} · {lead.pipeline_stage ?? 'new'}
        </p>
      </div>

      <div className="space-y-1">
        {callOpen ? (
          <CallScriptModal
            lead={lead}
            onClose={() => setCallOpen(false)}
            onOutcome={(outcome) => void handleCallOutcome(outcome)}
          />
        ) : null}
        {smsOpen ? (
          <SmsModal
            lead={lead}
            onClose={() => setSmsOpen(false)}
            onOutcome={(outcome) => void handleSmsOutcome(outcome)}
          />
        ) : null}
        {emailOpen ? (
          <EmailModal
            lead={lead}
            onClose={() => setEmailOpen(false)}
            onOutcome={(outcome) => void handleEmailOutcome(outcome)}
          />
        ) : null}
        {findMoreOpen ? (
          <LeadEnrichmentModal
            lead={lead}
            onClose={() => setFindMoreOpen(false)}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="CALL"
            disabled={actionDisabled}
            onClick={() => setCallOpen(true)}
          />
          <ActionButton
            label="TEXT"
            disabled={actionDisabled}
            onClick={() => setSmsOpen(true)}
          />
          <ActionButton
            label="EMAIL"
            disabled={actionDisabled}
            onClick={() => setEmailOpen(true)}
          />
          <ActionButton
            label="FIND MORE"
            disabled={actionDisabled}
            onClick={() => setFindMoreOpen(true)}
          />
          <div className="relative">
            <ActionButton
              label="DONE"
              disabled={actionDisabled}
              onClick={() => setDoneOpen((open) => !open)}
            />
            {doneOpen ? (
              <DoneMenu
                lead={lead}
                onNotInterested={() => void handleNotInterested()}
                onClosed={() => void handleClosed()}
                onArchive={() => void handleArchive()}
                onClose={() => setDoneOpen(false)}
              />
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="font-body text-coral text-xs mt-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function ActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className="font-body text-xs px-3 py-1.5 rounded border border-teal text-white bg-teal min-h-[44px] disabled:opacity-50 hover:bg-navy hover:border-navy transition-colors"
    >
      {label}
    </button>
  )
}
