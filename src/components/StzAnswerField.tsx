import {
  getAnswerSource,
  isAnswerPendingConfirmation,
} from '../services/stzProfileService'
import type { StzQuestion } from '../lib/stz-questions'
import type { StzProfile } from '../lib/types'

type StzAnswerFieldProps = {
  question: StzQuestion
  profile: StzProfile
  draft: string
  onDraftChange: (questionId: StzQuestion['id'], value: string) => void
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
  draft,
  onDraftChange,
}: StzAnswerFieldProps) {
  const pending = isAnswerPendingConfirmation(profile, question.id)
  const stored = profile[question.id]
  const storedText = typeof stored === 'string' ? stored : ''

  const source = getAnswerSource(profile, question.id)
  const badge = badgeForSource(source)

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
        value={draft}
        rows={4}
        placeholder={
          pending
            ? storedText ||
              'Jason: add your answer here. This item was not clear from the BNI transcript.'
            : 'Your answer…'
        }
        className="w-full font-body text-sm text-navy border border-mint rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal resize-y min-h-[6rem]"
        onChange={(e) => onDraftChange(question.id, e.target.value)}
      />
    </div>
  )
}
