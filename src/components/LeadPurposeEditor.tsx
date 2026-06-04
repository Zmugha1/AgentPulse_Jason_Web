import { useEffect, useRef, useState } from 'react'
import type { Lead } from '../lib/types'
import { updateLeadPurpose } from '../services/leadsService'

const MAX_LENGTH = 200

type LeadPurposeEditorProps = {
  lead: Lead
  onUpdated: (lead: Lead) => void
}

export default function LeadPurposeEditor({
  lead,
  onUpdated,
}: LeadPurposeEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(lead.purpose ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(lead.purpose ?? '')
      setError(null)
    }
  }, [lead.purpose, editing])

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    setDraft(lead.purpose ?? '')
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setDraft(lead.purpose ?? '')
    setError(null)
    setEditing(false)
  }

  async function saveDraft() {
    const normalized =
      draft.trim() === '' ? null : draft.trim().slice(0, MAX_LENGTH)
    const current = lead.purpose ?? null
    if (normalized === current) {
      setEditing(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await updateLeadPurpose(lead.id, normalized)
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purpose')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void saveDraft()
    }
  }

  if (editing) {
    return (
      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={textareaRef}
          value={draft}
          maxLength={MAX_LENGTH}
          rows={2}
          disabled={saving}
          className="w-full font-body text-xs text-navy border border-mint rounded px-2 py-1 focus:outline-none focus:border-teal resize-y min-h-[2.5rem]"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (!saving) void saveDraft()
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center gap-2 mt-0.5">
          {saving && (
            <span className="font-label text-[10px] text-slate">Saving…</span>
          )}
          <span className="font-label text-[10px] text-slate">
            {draft.length}/{MAX_LENGTH}
          </span>
        </div>
        {error && (
          <p className="font-body text-coral text-xs mt-0.5" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  const hasPurpose = Boolean(lead.purpose?.trim())

  return (
    <div className="mt-1 font-body text-xs">
      <button
        type="button"
        onClick={startEdit}
        className="text-left group inline-flex items-start gap-1 hover:text-teal"
        aria-label={hasPurpose ? 'Edit purpose' : 'Set purpose'}
      >
        <span className="text-slate shrink-0">Purpose:</span>
        <span className={hasPurpose ? 'text-navy' : 'text-slate'}>
          {hasPurpose ? lead.purpose : 'not set'}
        </span>
        <span
          className="text-teal opacity-60 group-hover:opacity-100 shrink-0"
          aria-hidden
        >
          ✎
        </span>
      </button>
    </div>
  )
}
