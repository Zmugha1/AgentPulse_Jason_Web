import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import {
  disconnectGoogle,
  getConnectionStatus,
  initiateConnect,
  type GoogleConnectionStatus,
} from '../services/googleOAuthService'
import { supabase } from '../lib/supabase'

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

function formatConnectedDate(date: Date | undefined): string {
  if (!date) return 'Unknown date'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function GoogleIntegrationCard() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [status, setStatus] = useState<GoogleConnectionStatus>({
    connected: false,
  })

  async function refreshStatus(email: string) {
    const next = await getConnectionStatus(email)
    setStatus(next)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const email = sessionData.session?.user?.email
        if (!email) throw new Error('Not signed in')
        if (cancelled) return
        setUserEmail(email)

        const params = new URLSearchParams(window.location.search)
        const oauthStatus = params.get('status')
        if (oauthStatus === 'connected') {
          setToast('Google account connected successfully.')
        } else if (oauthStatus === 'error') {
          const reason = params.get('reason') ?? 'unknown'
          const messages: Record<string, string> = {
            denied: 'Google connection was cancelled.',
            invalid_state: 'Connection expired or was invalid. Please try again.',
            token_exchange_failed: 'Could not complete Google sign-in. Please try again.',
          }
          setToast(messages[reason] ?? 'Google connection failed.')
        }
        if (oauthStatus) {
          window.history.replaceState({}, '', '/integrations')
        }

        await refreshStatus(email)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load Google status',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      await initiateConnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Google')
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!userEmail) return
    setBusy(true)
    setError(null)
    try {
      await disconnectGoogle(userEmail)
      await refreshStatus(userEmail)
      setToast('Google account disconnected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="bg-white border border-mint rounded-lg p-5 md:p-6 flex flex-col h-full">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <h3 className="font-heading text-lg text-navy">
          Google Account (Gmail + Calendar)
        </h3>
        <span
          className={`font-label text-[10px] uppercase tracking-wide rounded px-2 py-0.5 ${
            status.connected
              ? 'bg-teal/15 text-navy'
              : 'bg-slate/10 text-slate'
          }`}
        >
          {loading ? 'Checking…' : status.connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {toast ? (
        <p className="font-body text-sm text-teal mb-3" role="status">
          {toast}
        </p>
      ) : null}

      {error ? (
        <p className="font-body text-sm text-coral mb-3" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="font-body text-sm text-slate flex-1">
          Checking Google connection…
        </p>
      ) : status.connected ? (
        <div className="flex-1 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-teal shrink-0 mt-0.5" />
            <div>
              <p className="font-body text-sm text-navy">
                Connected as {status.google_email}
              </p>
              <p className="font-body text-sm text-slate mt-1">
                Connected on {formatConnectedDate(status.connected_at)}
              </p>
              <p className="font-body text-sm text-slate mt-1">
                Permissions: {status.scopesLabel}
              </p>
            </div>
          </div>
          <p className="font-body text-sm text-slate leading-relaxed">
            Gmail and Calendar read access is stored securely. AgentPulse will
            use this in a future phase to surface leads and showings.
          </p>
        </div>
      ) : (
        <p className="font-body text-sm text-slate leading-relaxed flex-1">
          Connect Gmail to receive Realtor.com and Zillow lead emails directly
          in AgentPulse. Connect Calendar to see your showings in Morning Brief.
        </p>
      )}

      <div className="mt-5">
        {loading ? null : status.connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="font-body w-full text-sm text-navy bg-cream border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-white disabled:opacity-60 transition-colors"
          >
            {busy ? 'Disconnecting…' : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            className="font-body w-full text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {busy ? 'Redirecting…' : 'Connect Google Account'}
          </button>
        )}
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
        <GoogleIntegrationCard />
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
