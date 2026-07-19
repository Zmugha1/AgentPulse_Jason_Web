import { Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const AUDIENCE_OPTIONS = [
  { value: 'Both', label: 'Both buyers and sellers' },
  { value: 'Sellers', label: 'Sellers' },
  { value: 'Buyers', label: 'Buyers' },
] as const

type GeneratorPhase =
  | 'idle'
  | 'generating'
  | 'success'
  | 'error'
  | 'publishing'
  | 'published'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'
const secondaryButtonClass =
  'font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30 transition-colors'
const largePrimaryButtonClass =
  'font-body text-base text-white bg-teal border border-teal rounded px-6 py-3 min-h-[48px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BlogGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [topic, setTopic] = useState('')
  const [targetAudience, setTargetAudience] = useState('Both')
  const [marketData, setMarketData] = useState('')
  const [title, setTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [slug, setSlug] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [errorRetryAction, setErrorRetryAction] = useState<'generate' | 'publish'>(
    'generate',
  )

  async function getAccessToken(): Promise<string | null> {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) return null
    return token
  }

  async function runGenerate() {
    const trimmedTopic = topic.trim()
    if (!trimmedTopic) {
      setError('Please enter a blog topic')
      setErrorRetryAction('generate')
      setPhase('error')
      return
    }

    setPhase('generating')
    setError(null)
    setShowPublishConfirm(false)
    setPublishedUrl(null)

    const token = await getAccessToken()
    if (!token) {
      setError('Please sign in again')
      setErrorRetryAction('generate')
      setPhase('error')
      return
    }

    try {
      const payloadBody: Record<string, string> = {
        topic: trimmedTopic,
        target_audience: targetAudience,
      }
      const trimmedMarketData = marketData.trim()
      if (trimmedMarketData) {
        payloadBody.market_data = trimmedMarketData
      }

      const res = await fetch('/api/generate-blog-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadBody),
      })

      const payload = (await res.json()) as {
        title?: string
        slug?: string
        meta_description?: string
        content?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not generate blog post')
        setErrorRetryAction('generate')
        setPhase('error')
        return
      }

      const nextTitle = payload.title?.trim() ?? ''
      const nextSlug = slugify(payload.slug?.trim() || nextTitle)
      setTitle(nextTitle)
      setMetaDescription(payload.meta_description?.trim() ?? '')
      setSlug(nextSlug)
      setContent(payload.content?.trim() ?? '')
      setPhase('success')
    } catch {
      setError('Could not generate blog post')
      setErrorRetryAction('generate')
      setPhase('error')
    }
  }

  async function runPublish() {
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    const trimmedSlug = slugify(slug.trim())
    const trimmedMeta = metaDescription.trim()

    if (!trimmedTitle || !trimmedContent || !trimmedSlug || !trimmedMeta) {
      setError('Title, slug, meta description, and content are required to publish')
      setErrorRetryAction('publish')
      setPhase('error')
      return
    }

    setPhase('publishing')
    setError(null)
    setShowPublishConfirm(false)

    const token = await getAccessToken()
    if (!token) {
      setError('Please sign in again')
      setErrorRetryAction('publish')
      setPhase('error')
      return
    }

    try {
      const res = await fetch('/api/publish-blog-post', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: trimmedTitle,
          content: trimmedContent,
          slug: trimmedSlug,
          meta_description: trimmedMeta,
          publish_date: todayIsoDate(),
        }),
      })

      const payload = (await res.json()) as {
        success?: boolean
        url?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not publish blog post')
        setErrorRetryAction('publish')
        setPhase('error')
        return
      }

      const url =
        payload.url?.trim() ||
        `https://thesuepattigroup.ai/blog/${trimmedSlug}.html`
      setSlug(trimmedSlug)
      setPublishedUrl(url)
      setPhase('published')
    } catch {
      setError('Could not publish blog post')
      setErrorRetryAction('publish')
      setPhase('error')
    }
  }

  function handleRetry() {
    if (errorRetryAction === 'publish') {
      void runPublish()
      return
    }
    void runGenerate()
  }

  if (phase === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Writing your blog post...</p>
      </div>
    )
  }

  if (phase === 'publishing') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Publishing...</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4">
        <p className="font-body text-sm text-coral" role="alert">
          {error ?? 'Something went wrong'}
        </p>
        <button type="button" onClick={handleRetry} className={primaryButtonClass}>
          Retry
        </button>
      </div>
    )
  }

  if (phase === 'published' && publishedUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Check className="w-6 h-6 text-teal shrink-0 mt-0.5" aria-hidden />
          <div className="space-y-2">
            <p className="font-body text-sm text-navy">Published. Live at:</p>
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm text-teal underline break-all"
            >
              {publishedUrl}
            </a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${primaryButtonClass} inline-flex items-center justify-center`}
          >
            View on website
          </a>
          <button
            type="button"
            onClick={() => {
              setPhase('idle')
              setTopic('')
              setTargetAudience('Both')
              setMarketData('')
              setTitle('')
              setMetaDescription('')
              setSlug('')
              setContent('')
              setError(null)
              setShowPublishConfirm(false)
              setPublishedUrl(null)
            }}
            className={secondaryButtonClass}
          >
            Write another
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'success') {
    const titleCount = title.length
    const metaCount = metaDescription.length
    const wordCount = countWords(content)
    const previewSlug = slugify(slug) || 'your-slug'

    return (
      <div className="space-y-4">
        <div className="rounded border border-mint bg-white p-4 space-y-2">
          <label htmlFor="blog-title" className={labelClass}>
            Post Title
          </label>
          <input
            id="blog-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <p className="font-label text-xs text-slate">
            {titleCount} characters (target under 60)
          </p>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-2">
          <label htmlFor="blog-meta" className={labelClass}>
            Meta Description
          </label>
          <input
            id="blog-meta"
            type="text"
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
            className={inputClass}
          />
          <p
            className={`font-label text-xs ${
              metaCount > 155 ? 'text-coral' : 'text-slate'
            }`}
          >
            {metaCount} characters (target under 155)
          </p>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-2">
          <label htmlFor="blog-slug" className={labelClass}>
            Post URL
          </label>
          <p className="font-body text-sm text-slate break-all">
            thesuepattigroup.ai/blog/{previewSlug}.html
          </p>
          <input
            id="blog-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-2">
          <label htmlFor="blog-content" className={labelClass}>
            Blog Content
          </label>
          <textarea
            id="blog-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className={inputClass}
          />
          <p className="font-label text-xs text-slate">{wordCount} words</p>
        </div>

        {showPublishConfirm ? (
          <div className="rounded border border-mint bg-cream/40 p-4 space-y-3">
            <p className="font-body text-sm text-navy">
              Publish this post to thesuepattigroup.ai/blog/{previewSlug}.html? It
              will be live within 2 minutes.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPublishConfirm(false)}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runPublish()}
                className={primaryButtonClass}
              >
                Publish Now
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runGenerate()}
              className={secondaryButtonClass}
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => setShowPublishConfirm(true)}
              className={largePrimaryButtonClass}
            >
              Publish to Website
            </button>
          </div>
        )}
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
        <label htmlFor="blog-topic" className={labelClass}>
          Blog topic
        </label>
        <input
          id="blog-topic"
          type="text"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Why Lake Country is still a seller's market in 2026"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="blog-audience" className={labelClass}>
          Target audience
        </label>
        <select
          id="blog-audience"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          className={inputClass}
        >
          {AUDIENCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="blog-market-data" className={labelClass}>
          Market data (optional)
        </label>
        <textarea
          id="blog-market-data"
          value={marketData}
          onChange={(e) => setMarketData(e.target.value)}
          rows={4}
          placeholder="Paste MLS stats to make the post more specific and credible"
          className={inputClass}
        />
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full`}>
        Generate
      </button>
    </form>
  )
}
