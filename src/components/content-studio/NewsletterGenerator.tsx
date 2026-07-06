import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TONE_OPTIONS = [
  'Warm and informative',
  'Urgent market update',
  'Celebratory (recent sale or milestone)',
  'Educational (buyer or seller tips)',
] as const

type GeneratorPhase = 'idle' | 'loading' | 'success' | 'error'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'
const secondaryButtonClass =
  'font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30 transition-colors'

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export default function NewsletterGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState<string>(TONE_OPTIONS[0])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const wordCount = useMemo(() => countWords(body), [body])

  async function runGenerate() {
    const trimmedTopic = topic.trim()
    if (!trimmedTopic) {
      setError('Please enter a topic or theme')
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
      const res = await fetch('/api/generate-newsletter', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic: trimmedTopic, tone }),
      })

      const payload = (await res.json()) as {
        subject?: string
        body?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not generate newsletter')
        setPhase('error')
        return
      }

      setSubject(payload.subject?.trim() ?? '')
      setBody(payload.body?.trim() ?? '')
      setPhase('success')
    } catch {
      setError('Could not generate newsletter')
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

  function handleCopySubject() {
    void copyText(subject, 'Subject copied')
  }

  function handleCopyBody() {
    void copyText(body, 'Body copied')
  }

  function handleCopyBoth() {
    const combined = `${subject.trim()}\n\n---\n\n${body.trim()}`
    void copyText(combined, 'Subject and body copied')
  }

  function handleGenerateAnother() {
    setPhase('idle')
    setTopic('')
    setTone(TONE_OPTIONS[0])
    setSubject('')
    setBody('')
    setError(null)
    setCopyFeedback(null)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Writing your newsletter...</p>
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
        <div>
          <label htmlFor="newsletter-subject" className={labelClass}>
            Subject line
          </label>
          <input
            id="newsletter-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="newsletter-body" className={labelClass}>
            Newsletter body
          </label>
          <textarea
            id="newsletter-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={15}
            className={inputClass}
          />
          <p className="font-body text-sm text-slate mt-2">
            {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          </p>
        </div>

        {copyFeedback ? (
          <p className="font-body text-sm text-teal" role="status">
            {copyFeedback}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleCopySubject} className={secondaryButtonClass}>
            Copy Subject
          </button>
          <button type="button" onClick={handleCopyBody} className={secondaryButtonClass}>
            Copy Body
          </button>
          <button type="button" onClick={handleCopyBoth} className={secondaryButtonClass}>
            Copy Both
          </button>
          <button
            type="button"
            onClick={handleGenerateAnother}
            className={primaryButtonClass}
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
        <label htmlFor="newsletter-topic" className={labelClass}>
          Topic or theme
        </label>
        <input
          id="newsletter-topic"
          type="text"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Summer market update, new listing spotlight, first-time buyer tips"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="newsletter-tone" className={labelClass}>
          Tone
        </label>
        <select
          id="newsletter-tone"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className={inputClass}
        >
          {TONE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full`}>
        Generate
      </button>
    </form>
  )
}
