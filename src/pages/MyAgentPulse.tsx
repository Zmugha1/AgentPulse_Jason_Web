export default function MyAgentPulse() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-2xl md:text-3xl text-navy">
          My AgentPulse
        </h2>
        <p className="font-body text-base text-slate mt-2">
          Your intelligence profile and STZ framework answers
        </p>
      </header>

      <div className="flex justify-center">
        <article className="w-full max-w-2xl bg-white border border-mint rounded-lg p-6 md:p-8 text-center shadow-sm">
          <p className="font-body text-navy leading-relaxed text-left">
            This page will hold your 25 STZ framework answers — how you think,
            how you talk to clients, how you work each pipeline stage, and how
            you close deals. AgentPulse uses these answers to eventually draft
            messages in your voice and surface insights tuned to your style.
          </p>
          <p className="font-label text-sm text-teal mt-6 uppercase tracking-wide">
            Form coming in next session.
          </p>
        </article>
      </div>
    </div>
  )
}
