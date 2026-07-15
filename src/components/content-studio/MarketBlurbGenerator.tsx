import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const ANGLE_OPTIONS = [
  'For sellers',
  'For buyers',
  'General update',
] as const

type GeneratorPhase = 'idle' | 'loading' | 'success' | 'error'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'
const secondaryButtonClass =
  'font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30 transition-colors'

export default function MarketBlurbGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [area, setArea] = useState('')
  const [angle, setAngle] = useState('')
  const [marketData, setMarketData] = useState('')
  const [newsletterBlurb, setNewsletterBlurb] = useState('')
  const [socialPost, setSocialPost] = useState('')
  const [blogIntro, setBlogIntro] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [pdfExtracting, setPdfExtracting] = useState(false)
  const [pdfExtractSuccess, setPdfExtractSuccess] = useState(false)
  const [pdfExtractError, setPdfExtractError] = useState<string | null>(null)
  const [pdfInputKey, setPdfInputKey] = useState(0)

  async function runGenerate() {
    if (!angle.trim()) {
      setError('Please select an angle')
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
      const payloadBody: Record<string, string> = {
        angle,
      }
      const trimmedArea = area.trim()
      const trimmedMarketData = marketData.trim()
      if (trimmedArea) payloadBody.area = trimmedArea
      if (trimmedMarketData) payloadBody.market_data = trimmedMarketData

      const res = await fetch('/api/generate-market-blurb', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadBody),
      })

      const payload = (await res.json()) as {
        newsletter_blurb?: string
        social_post?: string
        blog_intro?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not generate market update')
        setPhase('error')
        return
      }

      setNewsletterBlurb(payload.newsletter_blurb?.trim() ?? '')
      setSocialPost(payload.social_post?.trim() ?? '')
      setBlogIntro(payload.blog_intro?.trim() ?? '')
      setPhase('success')
    } catch {
      setError('Could not generate market update')
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

  async function handlePdfSelect(file: File | null) {
    if (!file) return

    setPdfExtractError(null)
    setPdfExtractSuccess(false)

    if (file.type && file.type !== 'application/pdf') {
      setMarketData('')
      setPdfExtractError('Please upload a PDF file')
      setPdfInputKey((k) => k + 1)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMarketData('')
      setPdfExtractError('PDF must be 5MB or smaller')
      setPdfInputKey((k) => k + 1)
      return
    }

    setPdfExtracting(true)

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) {
      setMarketData('')
      setPdfExtractError('Please sign in again')
      setPdfExtracting(false)
      setPdfInputKey((k) => k + 1)
      return
    }

    try {
      const formData = new FormData()
      formData.append('pdf', file)

      const res = await fetch('/api/extract-pdf-text', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const payload = (await res.json()) as {
        text?: string
        message?: string
      }

      if (!res.ok) {
        setMarketData('')
        setPdfExtractError(payload.message ?? 'Could not extract text from PDF')
        setPdfInputKey((k) => k + 1)
        return
      }

      const text = payload.text?.trim() ?? ''
      if (!text) {
        setMarketData('')
        setPdfExtractError('No text could be extracted from this PDF')
        setPdfInputKey((k) => k + 1)
        return
      }

      setMarketData(text)
      setPdfExtractSuccess(true)
    } catch {
      setMarketData('')
      setPdfExtractError('Could not extract text from PDF')
      setPdfInputKey((k) => k + 1)
    } finally {
      setPdfExtracting(false)
    }
  }

  function handleGenerateAnother() {
    setPhase('idle')
    setArea('')
    setAngle('')
    setMarketData('')
    setNewsletterBlurb('')
    setSocialPost('')
    setBlogIntro('')
    setError(null)
    setCopyFeedback(null)
    setPdfExtracting(false)
    setPdfExtractSuccess(false)
    setPdfExtractError(null)
    setPdfInputKey((k) => k + 1)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Writing your market update...</p>
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
          <label htmlFor="market-newsletter-blurb" className={labelClass}>
            Newsletter Blurb
          </label>
          <textarea
            id="market-newsletter-blurb"
            value={newsletterBlurb}
            onChange={(e) => setNewsletterBlurb(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(newsletterBlurb, 'Newsletter blurb copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="market-social-post" className={labelClass}>
            Social Post
          </label>
          <textarea
            id="market-social-post"
            value={socialPost}
            onChange={(e) => setSocialPost(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(socialPost, 'Social post copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="market-blog-intro" className={labelClass}>
            Blog Intro
          </label>
          <textarea
            id="market-blog-intro"
            value={blogIntro}
            onChange={(e) => setBlogIntro(e.target.value)}
            rows={4}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(blogIntro, 'Blog intro copied')}
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
        <label htmlFor="market-area" className={labelClass}>
          Area
        </label>
        <input
          id="market-area"
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="e.g. Lake Country, Oconomowoc, Waukesha County"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="market-angle" className={labelClass}>
          Angle
        </label>
        <select
          id="market-angle"
          required
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          className={inputClass}
        >
          <option value="">Select an angle</option>
          {ANGLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="market-pdf-upload" className={labelClass}>
          Upload MLS Market Report (optional)
        </label>
        <p className="font-body text-sm text-slate mt-1">
          Upload your Metro MLS PDF report and we will extract the stats
          automatically
        </p>
        <input
          key={pdfInputKey}
          id="market-pdf-upload"
          type="file"
          accept=".pdf,application/pdf"
          disabled={pdfExtracting}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            void handlePdfSelect(file)
          }}
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-mint file:px-3 file:py-1 file:font-body file:text-sm file:text-navy`}
        />
        {pdfExtracting ? (
          <p className="font-body text-sm text-slate mt-2 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-teal" aria-hidden />
            Extracting stats from PDF...
          </p>
        ) : null}
        {pdfExtractError ? (
          <p className="font-body text-sm text-coral mt-2" role="alert">
            {pdfExtractError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="market-data" className={labelClass}>
          Paste market stats (optional)
        </label>
        <textarea
          id="market-data"
          value={marketData}
          onChange={(e) => {
            setMarketData(e.target.value)
            if (pdfExtractSuccess) setPdfExtractSuccess(false)
            if (pdfExtractError) setPdfExtractError(null)
          }}
          rows={6}
          placeholder="e.g. Closed sales up 7%, median price $400k, 19 days on market, inventory up 8.6%"
          className={inputClass}
        />
        {pdfExtractSuccess ? (
          <p className="font-body text-sm text-teal mt-2" role="status">
            Stats extracted from PDF
          </p>
        ) : null}
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full`}>
        Generate
      </button>
    </form>
  )
}
