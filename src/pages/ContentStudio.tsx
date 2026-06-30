import { useState } from 'react'

type ContentStudioTab = 'newsletter' | 'social-posts' | 'listings' | 'market-update'

const CONTENT_STUDIO_TABS: { id: ContentStudioTab; label: string }[] = [
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'social-posts', label: 'Social Posts' },
  { id: 'listings', label: 'Listings' },
  { id: 'market-update', label: 'Market Update' },
]

export default function ContentStudio() {
  const [activeTab, setActiveTab] = useState<ContentStudioTab>('newsletter')

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
        <p className="font-body text-base text-slate">Coming in this session</p>
      </section>
    </div>
  )
}
