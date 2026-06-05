import { useEffect, useRef, useState } from 'react'
import {
  getAnswerSource,
  getAnswerValue,
  isAnswerPendingConfirmation,
  updateAnswer,
} from '../services/stzProfileService'
import type { StzQuestion } from '../lib/stz-questions'
import type { StzProfile } from '../lib/types'

type StzAnswerFieldProps = {
  question: StzQuestion
  profile: StzProfile
  userEmail: string
  onProfileUpdated: (profile: StzProfile) => void
}

function badgeForSource(
  source: ReturnType<typeof getAnswerSource>,
): { label: string; className: string } | null {
  if (source === 'bni_transcript_seeded') {
    return {
      label: 'Seeded from BNI transcript',
      className: 'bg-teal/15 text-teal',
    }
  }
  if (source === 'needs_confirmation') {
    return {
      label: 'Needs Jason confirmation',
      className: 'bg-coral/15 text-coral',
    }
  }
  if (source === 'user_edited') {
    return { label: 'Edited', className: 'bg-slate/15 text-slate' }
  }
  return null
}

export default function StzAnswerField({
  question,
  profile,
  userEmail,
  onProfileUpdated,
}: StzAnswerFieldProps) {
  const pending = isAnswerPendingConfirmation(profile, question.id)
  const stored = getAnswerValue(profile, question.id)
  const displayInitial = pending ? '' : stored

  const [draft, setDraft] = useState(displayInitial)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(pending ? '' : getAnswerValue(profile, question.id))
    setError(null)
  }, [profile, question.id, pending])

  const source = getAnswerSource(profile, question.id)
  const badge = badgeForSource(source)

  async function saveDraft() {
    const normalized = draft.trim()
    const compareTo = pending ? '' : stored.trim()
    if (normalized === compareTo) {
      setSaveState('idle')
      return
    }

    setSaving(true)
    setSaveState('saving')
    setError(null)
    try {
      const updated = await updateAnswer(userEmail, question.id, normalized)
      onProfileUpdated(updated)
      setSaveState('saved')
      window.setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaveState('idle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-mint/60 rounded-lg p-4 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <p className="font-body text-sm text-navy font-semibold leading-snug pr-2">
          {question.text}
        </p>
        {badge ? (
          <span
            className={`font-label text-[10px] uppercase tracking-wide rounded px-2 py-0.5 shrink-0 ${badge.className}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        rows={4}
        disabled={saving}
        placeholder={
          pending
            ? stored ||
              'Jason: add your answer here. This item was not clear from the BNI transcript.'
            : 'Your answer…'
        }
        className="w-full font-body text-sm text-navy border border-mint rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal resize-y min-h-[6rem]"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!saving) void saveDraft()
        }}
      />

      <div className="flex items-center gap-3 mt-1 min-h-[1.25rem]">
        {saveState === 'saving' && (
          <span className="font-label text-[10px] text-slate">Saving…</span>
        )}
        {saveState === 'saved' && (
          <span className="font-label text-[10px] text-teal">Saved</span>
        )}
        {error ? (
          <p className="font-body text-coral text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
