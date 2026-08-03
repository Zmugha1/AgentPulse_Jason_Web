import { useEffect, useState } from 'react'
import BlogGenerator from '../components/content-studio/BlogGenerator'
import ListingDescriptionGenerator from '../components/content-studio/ListingDescriptionGenerator'
import MarketBlurbGenerator from '../components/content-studio/MarketBlurbGenerator'
import NewsletterGenerator from '../components/content-studio/NewsletterGenerator'
import PodcastGenerator from '../components/content-studio/PodcastGenerator'
import SocialPostGenerator from '../components/content-studio/SocialPostGenerator'
import WebsiteManager from '../components/content-studio/WebsiteManager'
import { openMarketIntel } from '../lib/marketPulseFilter'
import { supabase } from '../lib/supabase'

type ContentStudioTab =
  | 'newsletter'
  | 'social-posts'
  | 'listings'
  | 'market-update'
  | 'podcast'
  | 'blog'
  | 'website'

const CONTENT_STUDIO_TABS: { id: ContentStudioTab; label: string }[] = [
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'social-posts', label: 'Social Posts' },
  { id: 'listings', label: 'Listings' },
  { id: 'market-update', label: 'Market Update' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'blog', label: 'Blog' },
  { id: 'website', label: 'Website' },
]

type ActiveReportSummary = {
  id: string
  area: string
  use_in_prompts?: boolean
}

export default function ContentStudio() {
  const [activeTab, setActiveTab] = useState<ContentStudioTab>('newsletter')
  const [promptAreas, setPromptAreas] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadReports() {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (sessionError || !token) {
        if (!cancelled) setPromptAreas([])
        return
      }

      try {
        const res = await fetch('/api/get-active-market-report', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const payload = (await res.json()) as {
          reports?: ActiveReportSummary[]
        }
        if (cancelled) return
        if (!res.ok || !Array.isArray(payload.reports)) {
          setPromptAreas([])
          return
        }

        const areas = payload.reports
          .filter((row) => row.use_in_prompts !== false)
          .map((row) => row.area?.trim())
          .filter((area): area is string => Boolean(area))
        setPromptAreas(areas)
      } catch {
        if (!cancelled) setPromptAreas([])
      }
    }

    void loadReports()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-2xl md:text-3xl text-navy">
          Content Studio
        </h2>
        <p className="font-body text-base text-slate mt-2">
          Generate newsletter content, social posts, listing descriptions, and
          market updates in your voice
        </p>
      </header>

      {promptAreas === null ? null : promptAreas.length > 0 ? (
        <div className="bg-mint/40 border border-teal/40 rounded-lg px-4 py-3">
          <p className="font-body text-sm text-navy">
            Using market data: {promptAreas.join(', ')}. All content will include
            real MLS numbers. Update reports on Market Intel.
          </p>
        </div>
      ) : (
        <div className="bg-cream border border-mint rounded-lg px-4 py-3">
          <p className="font-body text-sm text-slate">
            No market report loaded. Upload your MLS report on Market Intel to
            get content with real local numbers.{' '}
            <button
              type="button"
              onClick={() => openMarketIntel()}
              className="text-teal underline hover:text-navy"
            >
              Open Market Intel
            </button>
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {CONTENT_STUDIO_TABS.map((tab) => {
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`font-body text-sm rounded-full px-4 py-2 min-h-[44px] transition-colors ${
                selected
                  ? 'bg-teal text-white'
                  : 'bg-cream text-slate hover:bg-mint/40'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <section className="bg-white border border-mint rounded-lg p-6 md:p-8">
        {activeTab === 'newsletter' && <NewsletterGenerator />}
        {activeTab === 'social-posts' && <SocialPostGenerator />}
        {activeTab === 'listings' && <ListingDescriptionGenerator />}
        {activeTab === 'market-update' && <MarketBlurbGenerator />}
        {activeTab === 'podcast' && <PodcastGenerator />}
        {activeTab === 'blog' && <BlogGenerator />}
        {activeTab === 'website' && <WebsiteManager />}
      </section>
    </div>
  )
}
