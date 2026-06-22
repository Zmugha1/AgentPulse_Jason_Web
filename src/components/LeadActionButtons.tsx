import { useState } from 'react'
import type { Lead } from '../lib/types'
import { logInteraction } from '../services/interactionsService'
import { updateLeadStage } from '../services/leadsService'
import { BRIEF_ACTIONS, type BriefAction } from './ActionButtons'
import SmsModal from './SmsModal'
import EmailModal from './EmailModal'
import CallScriptModal from './CallScriptModal'

const STAGE_BY_OUTCOME: Record<string, string> = {
  called: 'contacted',
  emailed: 'contacted',
  voicemail: 'attempted',
  not_interested: 'attempted',
  no_answer: 'attempted',
}

const CONTACT_OUTCOMES = new Set(['called', 'voicemail', 'emailed'])

type LeadActionButtonsProps = {
  lead: Lead
  onLeadUpdated: (lead: Lead) => void
  disabled?: boolean
}

export default function LeadActionButtons({
  lead,
  onLeadUpdated,
  disabled,
}: LeadActionButtonsProps) {
  const [busy, setBusy] = useState(false)
  const [successKey, setSuccessKey] = useState<BriefAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [smsOpen, setSmsOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [callPrepOpen, setCallPrepOpen] = useState(false)

  async function handleAction(actionKey: BriefAction) {
    const action = BRIEF_ACTIONS.find((item) => item.key === actionKey)
    if (!action || busy || disabled) return

    const previous = lead
    const stage = STAGE_BY_OUTCOME[action.outcome]
    const now = new Date().toISOString()
    const optimistic: Lead = {
      ...lead,
      pipeline_stage: stage ?? lead.pipeline_stage,
      last_contact_at: CONTACT_OUTCOMES.has(action.outcome)
        ? now
        : lead.last_contact_at,
      updated_at: now,
    }

    setBusy(true)
    setError(null)
    onLeadUpdated(optimistic)

    try {
      await logInteraction(lead.id, action.type, action.outcome)
      if (stage) {
        await updateLeadStage(lead.id, stage)
      }
      setSuccessKey(actionKey)
      window.setTimeout(() => setSuccessKey(null), 1000)
    } catch (err) {
      onLeadUpdated(previous)
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const outreachButtons = (
    <>
      <OutreachButton
        label="Text"
        disabled={busy || disabled}
        onClick={() => setSmsOpen(true)}
      />
      <OutreachButton
        label="Email"
        disabled={busy || disabled}
        onClick={() => setEmailOpen(true)}
      />
      <OutreachButton
        label="Call Prep"
        disabled={busy || disabled}
        onClick={() => setCallPrepOpen(true)}
      />
    </>
  )

  const pipelineButtons = BRIEF_ACTIONS.map((action) => (
    <PipelineButton
      key={action.key}
      label={action.label}
      succeeded={successKey === action.key}
      disabled={busy || disabled}
      onClick={() => void handleAction(action.key)}
    />
  ))

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
      {smsOpen ? (
        <SmsModal lead={lead} onClose={() => setSmsOpen(false)} />
      ) : null}
      {emailOpen ? (
        <EmailModal lead={lead} onClose={() => setEmailOpen(false)} />
      ) : null}
      {callPrepOpen ? (
        <CallScriptModal lead={lead} onClose={() => setCallPrepOpen(false)} />
      ) : null}

      <details className="md:hidden">
        <summary className="font-label text-xs text-teal cursor-pointer list-none">
          Actions
        </summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-col gap-1">{outreachButtons}</div>
          <div className="flex flex-col gap-1">{pipelineButtons}</div>
        </div>
      </details>

      <div className="hidden md:block space-y-1 max-w-[360px]">
        <div className="flex flex-wrap gap-1">{outreachButtons}</div>
        <div className="flex flex-wrap gap-1">{pipelineButtons}</div>
      </div>

      {error ? (
        <p className="font-body text-coral text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function OutreachButton({
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

function PipelineButton({
  label,
  succeeded,
  disabled,
  onClick,
}: {
  label: string
  succeeded: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className={`font-label text-[10px] px-2 py-1 rounded border min-h-[32px] disabled:opacity-50 transition-colors ${
        succeeded
          ? 'border-teal bg-teal text-white'
          : 'border-mint text-slate bg-white hover:border-slate hover:text-navy'
      }`}
    >
      {succeeded ? '✓' : label}
    </button>
  )
}
