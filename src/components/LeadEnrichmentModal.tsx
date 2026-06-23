import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { Lead } from '../lib/types'
import { supabase } from '../lib/supabase'

type LeadEnrichmentModalProps = {
  lead: Lead
  onClose: () => void
}

type GoogleContactMatch = {
  name: string | null
  organization: string | null
  job_title: string | null
  addresses: string[]
  notes: string | null
}

type GoogleContactsStatus =
  | 'found'
  | 'not_found'
  | 'not_connected'
  | 'scope_missing'
  | 'error'

type WebResearchResult = {
  owns_home: boolean | null
  current_address: string | null
  estimated_value: string | null
  estimated_equity: string | null
  years_at_address: string | null
  employer: string | null
  linkedin_url: string | null
  life_signals: string | null
  summary: string
}

type EnrichLeadResponse = {
  google_contact: GoogleContactMatch | null
  google_contacts_status: GoogleContactsStatus
  web_research: WebResearchResult
  enriched_at: string
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Lead'
}

function firstName(lead: Lead): string {
  return lead.first_name?.trim() || 'this contact'
}

function formatSource(source: string | null): string {
  if (!source) return 'unknown'
  if (source === 'realtor_com_full') return 'realtor full'
  if (source === 'realtor_com_contacts') return 'realtor contacts'
  return source
}

function formatResearchTimestamp(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'Researched just now'
  const seconds = (Date.now() - at.getTime()) / 1000
  if (seconds < 60) return 'Researched just now'
  return `Researched at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatOwnsHome(value: boolean | null): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return 'Unknown'
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : 'Unknown'
}

function hasWebResearchData(web: WebResearchResult): boolean {
  return (
    web.owns_home !== null ||
    Boolean(web.current_address?.trim()) ||
    Boolean(web.estimated_value?.trim()) ||
    Boolean(web.estimated_equity?.trim()) ||
    Boolean(web.years_at_address?.trim()) ||
    Boolean(web.employer?.trim()) ||
    Boolean(web.linkedin_url?.trim()) ||
    Boolean(web.life_signals?.trim()) ||
    Boolean(
      web.summary?.trim() &&
        web.summary.trim() !== 'Web research unavailable',
    )
  )
}

function isFullyEmpty(result: EnrichLeadResponse): boolean {
  const googleEmpty = result.google_contacts_status !== 'found'
  const webEmpty = !hasWebResearchData(result.web_research)
  return googleEmpty && webEmpty
}

function googleContactsMessage(status: GoogleContactsStatus): string {
  if (status === 'not_connected') {
    return 'Connect Google in Integrations to search contacts'
  }
  if (status === 'scope_missing') {
    return 'Reconnect Google in Integrations to grant Contacts access'
  }
  if (status === 'not_found') {
    return 'Not found in your Google Contacts'
  }
  if (status === 'error') {
    return 'Google Contacts lookup unavailable'
  }
  return 'Not found in your Google Contacts'
}

function ResearchRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="border-b border-mint/60 py-2 last:border-b-0">
      <div className="font-label text-[10px] uppercase text-slate">{label}</div>
      <div className="font-body text-sm text-navy mt-1">{children}</div>
    </div>
  )
}

export default function LeadEnrichmentModal({
  lead,
  onClose,
}: LeadEnrichmentModalProps) {
  const [result, setResult] = useState<EnrichLeadResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadEnrichment() {
      setLoading(true)
      setError(null)

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const userEmail = sessionData.session?.user?.email
      if (sessionError || !token || !userEmail) {
        if (!cancelled) {
          setError('Please sign in again')
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/enrich-lead', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lead_id: lead.id,
            user_email: userEmail,
          }),
        })

        const payload = (await res.json()) as EnrichLeadResponse & {
          message?: string
        }

        if (!res.ok) {
          if (!cancelled) {
            setError(
              res.status >= 500
                ? 'Research unavailable. Try again later.'
                : (payload.message ?? 'Research unavailable. Try again later.'),
            )
          }
          return
        }

        if (!cancelled) {
          setResult({
            google_contact: payload.google_contact ?? null,
            google_contacts_status:
              payload.google_contacts_status ?? 'error',
            web_research: payload.web_research ?? {
              owns_home: null,
              current_address: null,
              estimated_value: null,
              estimated_equity: null,
              years_at_address: null,
              employer: null,
              linkedin_url: null,
              life_signals: null,
              summary: 'Web research unavailable',
            },
            enriched_at: payload.enriched_at ?? new Date().toISOString(),
          })
        }
      } catch {
        if (!cancelled) {
          setError('Research unavailable. Try again later.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadEnrichment()
    return () => {
      cancelled = true
    }
  }, [lead.id])

  const contact = result?.google_contact ?? null
  const googleStatus = result?.google_contacts_status ?? 'error'
  const web = result?.web_research

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-enrichment-modal-title"
    >
      <div className="w-full sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col bg-cream border border-mint sm:rounded-lg shadow-lg">
        <div className="bg-navy px-4 py-3 sm:rounded-t-lg shrink-0">
          <h2
            id="lead-enrichment-modal-title"
            className="font-heading text-xl text-white"
          >
            Find More
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <header className="space-y-2">
            <h3 className="font-heading text-lg text-navy">
              {displayName(lead)}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-label rounded px-2 py-0.5 text-[10px] uppercase bg-teal/15 text-teal">
                {formatSource(lead.source)}
              </span>
              {result ? (
                <span className="font-body text-xs text-slate">
                  {formatResearchTimestamp(result.enriched_at)}
                </span>
              ) : null}
            </div>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 py-6">
              <Loader2
                className="w-5 h-5 animate-spin text-teal"
                aria-hidden
              />
              <p className="font-body text-sm text-slate">
                Researching {firstName(lead)}...
              </p>
            </div>
          ) : error ? (
            <p className="font-body text-sm text-coral" role="alert">
              {error}
            </p>
          ) : result && isFullyEmpty(result) ? (
            <p className="font-body text-sm text-slate leading-relaxed">
              No public information found for {firstName(lead)}. This may be a
              privacy-conscious contact.
            </p>
          ) : result ? (
            <>
              <section>
                <h4 className="font-heading text-base text-navy">
                  Google Contacts
                </h4>
                <div className="mt-2 bg-white border border-mint rounded-lg p-3">
                  {googleStatus === 'found' && contact ? (
                    <div className="space-y-2 font-body text-sm text-navy">
                      {contact.name ? (
                        <p>
                          <span className="font-label text-[10px] uppercase text-slate block">
                            Name
                          </span>
                          {contact.name}
                        </p>
                      ) : null}
                      {contact.organization ? (
                        <p>
                          <span className="font-label text-[10px] uppercase text-slate block">
                            Organization
                          </span>
                          {contact.organization}
                        </p>
                      ) : null}
                      {contact.job_title ? (
                        <p>
                          <span className="font-label text-[10px] uppercase text-slate block">
                            Job title
                          </span>
                          {contact.job_title}
                        </p>
                      ) : null}
                      {contact.addresses.length > 0 ? (
                        <p>
                          <span className="font-label text-[10px] uppercase text-slate block">
                            Address
                          </span>
                          {contact.addresses.join('; ')}
                        </p>
                      ) : null}
                      {contact.notes ? (
                        <p>
                          <span className="font-label text-[10px] uppercase text-slate block">
                            Notes
                          </span>
                          {contact.notes}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="font-body text-sm text-slate">
                      {googleContactsMessage(googleStatus)}
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h4 className="font-heading text-base text-navy">
                  Web Research
                </h4>
                <div className="mt-2 bg-mint/60 border border-mint rounded-lg px-3 py-2">
                  <p className="font-body text-xs text-slate">
                    Researched from public web sources. Verify before relying
                    on.
                  </p>
                </div>
                {web ? (
                  <div className="mt-2 bg-white border border-mint rounded-lg px-3 py-1">
                    <ResearchRow label="Home ownership">
                      {formatOwnsHome(web.owns_home)}
                    </ResearchRow>
                    <ResearchRow label="Current address">
                      {displayValue(web.current_address)}
                    </ResearchRow>
                    <ResearchRow label="Estimated value">
                      {displayValue(web.estimated_value)}
                    </ResearchRow>
                    <ResearchRow label="Estimated equity">
                      {displayValue(web.estimated_equity)}
                    </ResearchRow>
                    <ResearchRow label="Years at address">
                      {displayValue(web.years_at_address)}
                    </ResearchRow>
                    <ResearchRow label="Employer">
                      {displayValue(web.employer)}
                    </ResearchRow>
                    <ResearchRow label="LinkedIn">
                      {web.linkedin_url?.trim() ? (
                        <a
                          href={web.linkedin_url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal hover:text-navy underline break-all"
                        >
                          {web.linkedin_url.trim()}
                        </a>
                      ) : (
                        'Unknown'
                      )}
                    </ResearchRow>
                    <ResearchRow label="Life signals">
                      {web.life_signals?.trim()
                        ? web.life_signals.trim()
                        : 'None found'}
                    </ResearchRow>
                  </div>
                ) : null}
              </section>

              {web?.summary?.trim() ? (
                <section>
                  <h4 className="font-heading text-base text-navy">Summary</h4>
                  <p className="font-heading text-sm text-navy mt-2 leading-relaxed">
                    {web.summary.trim()}
                  </p>
                </section>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="border-t border-mint px-4 py-3 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
