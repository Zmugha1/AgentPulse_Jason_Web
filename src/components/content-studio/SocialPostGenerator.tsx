import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const POST_TYPE_OPTIONS = [
  'New listing',
  'Just sold',
  'Market update',
  'General / personal brand',
] as const

type GeneratorPhase = 'idle' | 'loading' | 'success' | 'error'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'
const secondaryButtonClass =
  'font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30 transition-colors'

export default function SocialPostGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [postType, setPostType] = useState('')
  const [details, setDetails] = useState('')
  const [social, setSocial] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  async function runGenerate() {
    if (!postType.trim()) {
      setError('Please select a post type')
      setPhase('error')
      return
    }
    const trimmedDetails = details.trim()
    if (!trimmedDetails) {
      setError('Please enter details')
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
      const res = await fetch('/api/generate-social-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_type: postType,
          details: trimmedDetails,
        }),
      })

      const payload = (await res.json()) as {
        social?: string
        linkedin?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not generate social posts')
        setPhase('error')
        return
      }

      setSocial(payload.social?.trim() ?? '')
      setLinkedin(payload.linkedin?.trim() ?? '')
      setPhase('success')
    } catch {
      setError('Could not generate social posts')
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

  function handleGenerateAnother() {
    setPhase('idle')
    setPostType('')
    setDetails('')
    setSocial('')
    setLinkedin('')
    setError(null)
    setCopyFeedback(null)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Writing your social posts...</p>
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
        <div
          className="rounded border border-mint bg-white p-4 space-y-3"
          style={{ borderLeftWidth: 4, borderLeftColor: 'rgba(24, 119, 242, 0.4)' }}
        >
          <label htmlFor="social-fb-ig" className={labelClass}>
            Facebook + Instagram
          </label>
          <textarea
            id="social-fb-ig"
            value={social}
            onChange={(e) => setSocial(e.target.value)}
            rows={5}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(social, 'Facebook + Instagram copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div
          className="rounded border border-mint bg-white p-4 space-y-3"
          style={{ borderLeftWidth: 4, borderLeftColor: 'rgba(10, 102, 194, 0.4)' }}
        >
          <label htmlFor="social-linkedin" className={labelClass}>
            LinkedIn
          </label>
          <textarea
            id="social-linkedin"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
            rows={5}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(linkedin, 'LinkedIn copied')}
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

        <button
          type="button"
          onClick={handleGenerateAnother}
          className={secondaryButtonClass}
        >
          Generate Another
        </button>
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
        <label htmlFor="social-post-type" className={labelClass}>
          Post type
        </label>
        <select
          id="social-post-type"
          required
          value={postType}
          onChange={(e) => setPostType(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a post type</option>
          {POST_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="social-details" className={labelClass}>
          Details
        </label>
        <textarea
          id="social-details"
          required
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder="e.g. 3 bed 2 bath in Hartland $450k updated kitchen large backyard just listed"
          className={inputClass}
        />
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full`}>
        Generate
      </button>
    </form>
  )
}
