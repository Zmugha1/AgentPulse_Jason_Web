import { useState } from 'react'
import type { Lead } from '../lib/types'
import { logInteraction } from '../services/interactionsService'
import { updateLeadStage } from '../services/leadsService'
import SmsModal from './SmsModal'
import EmailModal from './EmailModal'
import CallScriptModal from './CallScriptModal'
import LeadEnrichmentModal from './LeadEnrichmentModal'
import DoneMenu from './DoneMenu'

const CONTACT_OUTCOMES = new Set(['called', 'voicemail', 'emailed', 'texted'])

type LeadActionButtonsProps = {
  lead: Lead
  onLeadUpdated: (lead: Lead) => void
  onArchive?: (leadId: string) => Promise<void>
  disabled?: boolean
}

export default function LeadActionButtons({
  lead,
  onLeadUpdated,
  onArchive,
  disabled,
}: LeadActionButtonsProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [callOpen, setCallOpen] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [findMoreOpen, setFindMoreOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)

  async function runLoggedAction(
    patch: Pick<Lead, 'pipeline_stage'> & { last_contact_at?: string | null },
    action: () => Promise<void>,
  ) {
    if (busy || disabled) return

    const previous = lead
    const now = new Date().toISOString()
    const optimistic: Lead = {
      ...lead,
      ...patch,
      updated_at: now,
    }

    setBusy(true)
    setError(null)
    onLeadUpdated(optimistic)

    try {
      await action()
    } catch (err) {
      onLeadUpdated(previous)
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCallOutcome(
    outcome: 'called' | 'voicemail' | 'no_answer',
  ) {
    const stage =
      outcome === 'called' ? 'contacted' : 'attempted'
    const now = new Date().toISOString()

    await runLoggedAction(
      {
        pipeline_stage: stage,
        last_contact_at: CONTACT_OUTCOMES.has(outcome) ? now : lead.last_contact_at,
      },
      async () => {
        await logInteraction(lead.id, 'call', outcome)
        await updateLeadStage(lead.id, stage)
      },
    )
  }

  async function handleSmsOutcome(outcome: 'texted' | 'not_sent') {
    if (outcome === 'not_sent') return

    const now = new Date().toISOString()
    await runLoggedAction(
      {
        pipeline_stage: 'contacted',
        last_contact_at: now,
      },
      async () => {
        await logInteraction(lead.id, 'sms', 'texted')
        await updateLeadStage(lead.id, 'contacted')
      },
    )
  }

  async function handleEmailOutcome(outcome: 'emailed' | 'not_sent') {
    if (outcome === 'not_sent') return

    const now = new Date().toISOString()
    await runLoggedAction(
      {
        pipeline_stage: 'contacted',
        last_contact_at: now,
      },
      async () => {
        await logInteraction(lead.id, 'email', 'emailed')
        await updateLeadStage(lead.id, 'contacted')
      },
    )
  }

  async function handleNotInterested() {
    await runLoggedAction(
      { pipeline_stage: 'nurture' },
      async () => {
        await logInteraction(lead.id, 'contact', 'not_interested')
        await updateLeadStage(lead.id, 'nurture')
      },
    )
  }

  async function handleClosed() {
    await runLoggedAction({ pipeline_stage: 'closed' }, async () => {
      await updateLeadStage(lead.id, 'closed')
    })
  }

  async function handleArchive() {
    if (!onArchive || busy || disabled) return

    setBusy(true)
    setError(null)
    try {
      await onArchive(lead.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed')
    } finally {
      setBusy(false)
    }
  }

  const actionDisabled = busy || disabled

  const buttons = (
    <div className="flex flex-wrap gap-1 justify-end">
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
  )

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
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

      {buttons}

      {error ? (
        <p className="font-body text-coral text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
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
      className="font-label text-[10px] px-2 py-1 rounded border border-teal text-white bg-teal min-h-[32px] disabled:opacity-50 hover:bg-navy hover:border-navy transition-colors"
    >
      {label}
    </button>
  )
}
