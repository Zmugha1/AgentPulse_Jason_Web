import { useState } from 'react'
import type { Lead } from '../lib/types'
import { PIPELINE_STAGES } from '../lib/pipelineStages'
import { updateLeadStage } from '../services/leadsService'

type LeadStageEditorProps = {
  lead: Lead
  onUpdated: (lead: Lead) => void
}

export default function LeadStageEditor({
  lead,
  onUpdated,
}: LeadStageEditorProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = lead.pipeline_stage ?? 'new'

  async function handleChange(nextStage: string) {
    if (nextStage === current || saving) return

    setSaving(true)
    setError(null)
    onUpdated({ ...lead, pipeline_stage: nextStage })
    try {
      await updateLeadStage(lead.id, nextStage)
    } catch (err) {
      onUpdated({ ...lead, pipeline_stage: current })
      setError(err instanceof Error ? err.message : 'Failed to save stage')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <select
        value={current}
        disabled={saving}
        aria-label={`Pipeline stage for ${lead.first_name ?? 'lead'}`}
        className="font-label text-[10px] uppercase border border-mint rounded px-2 py-1 bg-white text-navy focus:outline-none focus:border-teal disabled:opacity-50 min-h-[32px]"
        onChange={(e) => void handleChange(e.target.value)}
      >
        {PIPELINE_STAGES.map((stage) => (
          <option key={stage.value} value={stage.value}>
            {stage.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="font-body text-coral text-xs mt-0.5" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
