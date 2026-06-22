import { useEffect, useState } from 'react'
import type { Lead } from '../lib/types'
import { supabase } from '../lib/supabase'

type EmailModalProps = {
  lead: Lead
  onClose: () => void
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Lead'
}

function hasUsableEmail(email: string | null): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
}

export default function EmailModal({ lead, onClose }: EmailModalProps) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadDraft() {
      setLoading(true)
      setError(null)

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (sessionError || !token) {
        if (!cancelled) {
          setError('Please sign in again')
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/draft-email', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lead_id: lead.id }),
        })

        const payload = (await res.json()) as {
          subject?: string
          body?: string
          message?: string
        }

        if (!res.ok) {
          if (!cancelled) {
            setError(payload.message ?? 'Could not generate email draft')
          }
          return
        }

        if (!cancelled) {
          setSubject(payload.subject?.trim() ?? '')
          setBody(payload.body?.trim() ?? '')
        }
      } catch {
        if (!cancelled) {
          setError('Could not generate email draft')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDraft()
    return () => {
      cancelled = true
    }
  }, [lead.id])

  const emailOk = hasUsableEmail(lead.email)

  const mailtoHref = lead.email
    ? `mailto:${lead.email.trim()}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(body.trim())}`
    : null

  async function handleCopyBody() {
    if (!body.trim()) return
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy to clipboard')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-modal-title"
    >
      <div className="w-full sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col bg-cream border border-mint sm:rounded-lg shadow-lg">
        <div className="bg-navy px-4 py-3 sm:rounded-t-lg shrink-0">
          <h2 id="email-modal-title" className="font-heading text-xl text-white">
            Compose Email
          </h2>
          <p className="font-body text-sm text-mint mt-1">
            Draft for {displayName(lead)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <p className="font-body text-sm text-slate">Generating draft...</p>
          ) : error ? (
            <p className="font-body text-sm text-coral" role="alert">
              {error}
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="email-subject" className="font-label text-xs uppercase text-slate">
                  Subject
                </label>
                <input
                  id="email-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>
              <div>
                <label htmlFor="email-body" className="font-label text-xs uppercase text-slate">
                  Body
                </label>
                <textarea
                  id="email-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>

              {!emailOk ? (
                <p className="font-body text-sm text-coral">
                  No email address on file for this lead
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-mint px-4 py-3 flex flex-wrap gap-2 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30"
          >
            Close
          </button>
          {body.trim() && !loading && !error ? (
            <button
              type="button"
              onClick={() => void handleCopyBody()}
              className="font-body text-sm text-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-teal/10"
            >
              {copied ? 'Copied' : 'Copy body'}
            </button>
          ) : null}
          {!loading && !error ? (
            mailtoHref ? (
              <a
                href={mailtoHref}
                className="font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy inline-flex items-center"
              >
                Open in Gmail
              </a>
            ) : (
              <span className="font-body text-sm text-slate">
                No email address on file
              </span>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
