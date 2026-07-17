import { Check, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TONE_OPTIONS = [
  'Warm and informative',
  'Urgent market update',
  'Celebratory (recent sale or milestone)',
  'Educational (buyer or seller tips)',
] as const

type GeneratorPhase = 'idle' | 'loading' | 'success' | 'error'
type SendPhase = 'idle' | 'confirm' | 'sending' | 'sent' | 'error'

type RecipientCounts = {
  hot: number
  warm: number
  cold: number
  archived: number
  never_contacted: number
  total_with_email: number
}

type NewsletterFilters = {
  include_hot: boolean
  include_warm: boolean
  include_cold: boolean
  include_archived: boolean
  include_never_contacted: boolean
}

const DEFAULT_FILTERS: NewsletterFilters = {
  include_hot: true,
  include_warm: true,
  include_cold: true,
  include_archived: false,
  include_never_contacted: true,
}

const EMPTY_COUNTS: RecipientCounts = {
  hot: 0,
  warm: 0,
  cold: 0,
  archived: 0,
  never_contacted: 0,
  total_with_email: 0,
}

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

function estimateRecipientCount(
  counts: RecipientCounts,
  filters: NewsletterFilters,
): number {
  let total = 0
  if (filters.include_hot) total += counts.hot
  if (filters.include_warm) total += counts.warm
  if (filters.include_cold) total += counts.cold
  if (filters.include_archived) total += counts.archived
  return total
}

export default function NewsletterGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState<string>(TONE_OPTIONS[0])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const [counts, setCounts] = useState<RecipientCounts>(EMPTY_COUNTS)
  const [countsLoading, setCountsLoading] = useState(false)
  const [countsError, setCountsError] = useState<string | null>(null)
  const [filters, setFilters] = useState<NewsletterFilters>(DEFAULT_FILTERS)
  const [sendPhase, setSendPhase] = useState<SendPhase>('idle')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)

  const wordCount = useMemo(() => countWords(body), [body])
  const recipientCount = useMemo(
    () => estimateRecipientCount(counts, filters),
    [counts, filters],
  )

  useEffect(() => {
    if (phase !== 'success') return

    let cancelled = false

    async function loadCounts() {
      setCountsLoading(true)
      setCountsError(null)

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (sessionError || !token) {
        if (!cancelled) {
          setCountsError('Please sign in again')
          setCountsLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/newsletter-recipient-counts', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        const payload = (await res.json()) as RecipientCounts & {
          message?: string
        }
        if (!res.ok) {
          if (!cancelled) {
            setCountsError(payload.message ?? 'Could not load recipient counts')
            setCounts(EMPTY_COUNTS)
          }
          return
        }
        if (!cancelled) {
          setCounts({
            hot: payload.hot ?? 0,
            warm: payload.warm ?? 0,
            cold: payload.cold ?? 0,
            archived: payload.archived ?? 0,
            never_contacted: payload.never_contacted ?? 0,
            total_with_email: payload.total_with_email ?? 0,
          })
        }
      } catch {
        if (!cancelled) {
          setCountsError('Could not load recipient counts')
          setCounts(EMPTY_COUNTS)
        }
      } finally {
        if (!cancelled) setCountsLoading(false)
      }
    }

    void loadCounts()
    return () => {
      cancelled = true
    }
  }, [phase])

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
    setSendPhase('idle')
    setSendError(null)
    setSentCount(0)
    setFailedCount(0)
    setFilters(DEFAULT_FILTERS)

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
    setCounts(EMPTY_COUNTS)
    setCountsError(null)
    setFilters(DEFAULT_FILTERS)
    setSendPhase('idle')
    setSendError(null)
    setSentCount(0)
    setFailedCount(0)
  }

  function toggleFilter(key: keyof NewsletterFilters) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
    if (sendPhase === 'confirm' || sendPhase === 'error') {
      setSendPhase('idle')
      setSendError(null)
    }
  }

  async function runSend() {
    setSendPhase('sending')
    setSendError(null)

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) {
      setSendError('Please sign in again')
      setSendPhase('error')
      return
    }

    try {
      const res = await fetch('/api/send-newsletter', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          filters,
        }),
      })

      const payload = (await res.json()) as {
        sent?: number
        failed?: number
        total_recipients?: number
        message?: string
      }

      if (!res.ok) {
        setSendError(payload.message ?? 'Could not send newsletter')
        setSendPhase('error')
        return
      }

      setSentCount(payload.sent ?? 0)
      setFailedCount(payload.failed ?? 0)
      setSendPhase('sent')
    } catch {
      setSendError('Could not send newsletter')
      setSendPhase('error')
    }
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

        <hr className="border-mint" />

        <div className="space-y-4">
          <div>
            <h3 className="font-heading text-lg text-navy">Send to Your Leads</h3>
            <p className="font-body text-sm text-slate mt-1">
              Select who receives this newsletter. Only leads with email addresses
              on file will receive it.
            </p>
          </div>

          {countsLoading ? (
            <p className="font-body text-sm text-slate flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-teal" aria-hidden />
              Loading recipient counts...
            </p>
          ) : null}

          {countsError ? (
            <p className="font-body text-sm text-coral" role="alert">
              {countsError}
            </p>
          ) : null}

          {!countsLoading && !countsError ? (
            <div className="space-y-3">
              {(
                [
                  ['include_hot', 'Hot leads', counts.hot],
                  ['include_warm', 'Warm leads', counts.warm],
                  ['include_cold', 'Cold leads', counts.cold],
                  ['include_archived', 'Archived leads', counts.archived],
                  [
                    'include_never_contacted',
                    'Never contacted',
                    counts.never_contacted,
                  ],
                ] as const
              ).map(([key, label, count]) => (
                <label
                  key={key}
                  className="flex items-center gap-3 font-body text-sm text-navy min-h-[44px]"
                >
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={() => toggleFilter(key)}
                    className="h-4 w-4 accent-teal"
                  />
                  <span>
                    {label}{' '}
                    <span className="text-slate" style={{ fontFamily: 'Courier New, monospace' }}>
                      ({count})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <p className="font-body text-sm text-teal" role="status">
            {recipientCount} leads will receive this newsletter
          </p>

          {sendPhase === 'idle' || sendPhase === 'confirm' ? (
            sendPhase === 'confirm' ? (
              <div className="space-y-3 rounded border border-mint bg-cream/40 p-4">
                <p className="font-body text-sm text-navy">
                  Send to {recipientCount} leads from jason@thesuepattigroup.com?
                  This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSendPhase('idle')}
                    className={secondaryButtonClass}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void runSend()}
                    className={primaryButtonClass}
                  >
                    Send Now
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={recipientCount === 0 || countsLoading}
                onClick={() => setSendPhase('confirm')}
                className={`${primaryButtonClass} w-full disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Send Newsletter to {recipientCount} Leads
              </button>
            )
          ) : null}

          {sendPhase === 'sending' ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
              <p className="font-body text-sm text-slate">
                Sending... (this may take a minute for large lists)
              </p>
            </div>
          ) : null}

          {sendPhase === 'sent' ? (
            <div className="space-y-2">
              <p className="font-body text-sm text-teal flex items-center gap-2" role="status">
                <Check className="w-5 h-5" aria-hidden />
                Sent to {sentCount} leads successfully.
              </p>
              {failedCount > 0 ? (
                <p className="font-body text-sm text-coral">
                  {failedCount} emails failed to send.
                </p>
              ) : null}
            </div>
          ) : null}

          {sendPhase === 'error' ? (
            <div className="space-y-3">
              <p className="font-body text-sm text-coral" role="alert">
                {sendError ?? 'Could not send newsletter'}
              </p>
              <button
                type="button"
                onClick={() => void runSend()}
                className={primaryButtonClass}
              >
                Retry
              </button>
            </div>
          ) : null}
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
