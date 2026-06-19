import { useState } from 'react'
import type { Lead } from '../lib/types'
import { logInteraction } from '../services/interactionsService'
import { updateLeadStage } from '../services/leadsService'
import { BRIEF_ACTIONS, type BriefAction } from './ActionButtons'

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

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
      <details className="md:hidden">
        <summary className="font-label text-xs text-teal cursor-pointer list-none">
          Actions
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          {BRIEF_ACTIONS.map((action) => (
            <ActionButton
              key={action.key}
              label={action.label}
              succeeded={successKey === action.key}
              disabled={busy || disabled}
              onClick={() => void handleAction(action.key)}
            />
          ))}
        </div>
      </details>
      <div className="hidden md:flex flex-wrap gap-1 max-w-[280px]">
        {BRIEF_ACTIONS.map((action) => (
          <ActionButton
            key={action.key}
            label={action.label}
            succeeded={successKey === action.key}
            disabled={busy || disabled}
            onClick={() => void handleAction(action.key)}
          />
        ))}
      </div>
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
          : 'border-mint text-slate bg-white hover:border-teal hover:text-teal'
      }`}
    >
      {succeeded ? '✓' : label}
    </button>
  )
}
