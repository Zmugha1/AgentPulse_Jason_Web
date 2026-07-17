import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const DURATION_OPTIONS = [
  { value: 10, label: '10 minutes' },
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30 minutes' },
] as const

type GeneratorPhase = 'idle' | 'loading' | 'success' | 'error'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'
const secondaryButtonClass =
  'font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30 transition-colors'

export default function PodcastGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [topic, setTopic] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(20)
  const [marketContext, setMarketContext] = useState('')
  const [episodeTitle, setEpisodeTitle] = useState('')
  const [openingHook, setOpeningHook] = useState('')
  const [talkingPoints, setTalkingPoints] = useState('')
  const [closingCta, setClosingCta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  async function runGenerate() {
    const trimmedTopic = topic.trim()
    if (!trimmedTopic) {
      setError('Please enter an episode topic')
      setPhase('error')
      return
    }

    setPhase('loading')
    setError(null)
    setCopyFeedback(null)

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) {
      setError('Please sign in again')
      setPhase('error')
      return
    }

    try {
      const payloadBody: Record<string, string | number> = {
        topic: trimmedTopic,
        duration_minutes: durationMinutes,
      }
      const trimmedContext = marketContext.trim()
      if (trimmedContext) {
        payloadBody.market_context = trimmedContext
      }

      const res = await fetch('/api/generate-podcast-outline', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadBody),
      })

      const payload = (await res.json()) as {
        episode_title?: string
        opening_hook?: string
        talking_points?: string
        closing_cta?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not generate podcast outline')
        setPhase('error')
        return
      }

      setEpisodeTitle(payload.episode_title?.trim() ?? '')
      setOpeningHook(payload.opening_hook?.trim() ?? '')
      setTalkingPoints(payload.talking_points?.trim() ?? '')
      setClosingCta(payload.closing_cta?.trim() ?? '')
      setPhase('success')
    } catch {
      setError('Could not generate podcast outline')
      setPhase('error')
    }
  }

  async function copyText(text: string, feedback: string) {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(feedback)
      window.setTimeout(() => setCopyFeedback(null), 1500)
    } catch {
      setError('Could not copy to clipboard')
      setPhase('error')
    }
  }

  function handleCopyAll() {
    const script = [
      `EPISODE TITLE`,
      episodeTitle.trim(),
      '',
      `OPENING HOOK`,
      openingHook.trim(),
      '',
      `TALKING POINTS`,
      talkingPoints.trim(),
      '',
      `CLOSING CALL TO ACTION`,
      closingCta.trim(),
    ].join('\n')
    void copyText(script, 'Full script copied')
  }

  function handleGenerateAnother() {
    setPhase('idle')
    setTopic('')
    setDurationMinutes(20)
    setMarketContext('')
    setEpisodeTitle('')
    setOpeningHook('')
    setTalkingPoints('')
    setClosingCta('')
    setError(null)
    setCopyFeedback(null)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Writing your episode outline...</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4">
        <p className="font-body text-sm text-coral" role="alert">
          {error ?? 'Something went wrong'}
        </p>
        <button
          type="button"
          onClick={() => void runGenerate()}
          className={primaryButtonClass}
        >
          Retry
        </button>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="space-y-4">
        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="podcast-episode-title" className={labelClass}>
            Episode Title
          </label>
          <input
            id="podcast-episode-title"
            type="text"
            value={episodeTitle}
            onChange={(e) => setEpisodeTitle(e.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(episodeTitle, 'Episode title copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="podcast-opening-hook" className={labelClass}>
            Opening Hook
          </label>
          <p className="font-body text-sm text-slate">
            Read this in the first 30 seconds to hook your audience
          </p>
          <textarea
            id="podcast-opening-hook"
            value={openingHook}
            onChange={(e) => setOpeningHook(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(openingHook, 'Opening hook copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="podcast-talking-points" className={labelClass}>
            Talking Points
          </label>
          <p className="font-body text-sm text-slate">
            One point per section of your episode
          </p>
          <textarea
            id="podcast-talking-points"
            value={talkingPoints}
            onChange={(e) => setTalkingPoints(e.target.value)}
            rows={10}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(talkingPoints, 'Talking points copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="podcast-closing-cta" className={labelClass}>
            Closing Call to Action
          </label>
          <p className="font-body text-sm text-slate">
            End every episode with this
          </p>
          <textarea
            id="podcast-closing-cta"
            value={closingCta}
            onChange={(e) => setClosingCta(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(closingCta, 'Closing CTA copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        {copyFeedback ? (
          <p className="font-body text-sm text-teal" role="status">
            {copyFeedback}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className={primaryButtonClass}
          >
            Copy All
          </button>
          <button
            type="button"
            onClick={handleGenerateAnother}
            className={secondaryButtonClass}
          >
            Generate Another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void runGenerate()
      }}
    >
      <div>
        <label htmlFor="podcast-topic" className={labelClass}>
          Episode topic
        </label>
        <input
          id="podcast-topic"
          type="text"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Why summer is still a great time to buy in Lake Country"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="podcast-duration" className={labelClass}>
          Episode length
        </label>
        <select
          id="podcast-duration"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className={inputClass}
        >
          {DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="podcast-market-context" className={labelClass}>
          Market context (optional)
        </label>
        <textarea
          id="podcast-market-context"
          value={marketContext}
          onChange={(e) => setMarketContext(e.target.value)}
          rows={4}
          placeholder="Paste any market stats or news you want to reference in the episode"
          className={inputClass}
        />
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full`}>
        Generate
      </button>
    </form>
  )
}
