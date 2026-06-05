type IntegrationCardProps = {
  title: string
  status: string
  statusTone?: 'muted' | 'active'
  description: string
  buttonLabel: string
  caption: string
}

function IntegrationCard({
  title,
  status,
  statusTone = 'muted',
  description,
  buttonLabel,
  caption,
}: IntegrationCardProps) {
  return (
    <article className="bg-white border border-mint rounded-lg p-5 md:p-6 flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <h3 className="font-heading text-lg text-navy">{title}</h3>
        <span
          className={`font-label text-[10px] uppercase tracking-wide rounded px-2 py-0.5 ${
            statusTone === 'active'
              ? 'bg-teal/15 text-navy'
              : 'bg-slate/10 text-slate'
          }`}
        >
          {status}
        </span>
      </div>
      <p className="font-body text-sm text-slate leading-relaxed flex-1">
        {description}
      </p>
      <div className="mt-5 space-y-2">
        <button
          type="button"
          disabled
          className="font-body w-full text-sm text-slate bg-cream border border-mint rounded px-4 py-2 min-h-[44px] opacity-70 cursor-not-allowed"
        >
          {buttonLabel}
        </button>
        <p className="font-label text-[10px] text-slate text-center uppercase tracking-wide">
          {caption}
        </p>
      </div>
    </article>
  )
}

export default function Integrations() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-2xl md:text-3xl text-navy">
          Integrations
        </h2>
        <p className="font-body text-base text-slate mt-2">
          Connect AgentPulse to your tools
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <IntegrationCard
          title="Google Account (Gmail + Calendar)"
          status="Not connected"
          description="Connect Gmail to receive Realtor.com and Zillow lead emails directly in AgentPulse. Connect Calendar to see your showings in Morning Brief."
          buttonLabel="Connect Google Account"
          caption="Coming soon — Phase 6 Part 3"
        />
        <IntegrationCard
          title="Realtor.com"
          status="Currently via CSV export"
          statusTone="active"
          description="Your Realtor.com leads currently flow in through CSV imports. A direct lead-delivery integration is on the roadmap once we know the right path for individual agents."
          buttonLabel="Learn more"
          caption="On roadmap"
        />
        <IntegrationCard
          title="Anthropic AI"
          status="Pending interaction history"
          description="AI-drafted follow-ups, stage-specific advice, and message personalization in your voice. Activates once you've built up 6–12 months of interaction history through Morning Brief action buttons."
          buttonLabel="Learn more"
          caption="Phase 7"
        />
      </div>
    </div>
  )
}
