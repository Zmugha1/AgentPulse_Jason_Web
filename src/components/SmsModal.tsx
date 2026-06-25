import { useEffect, useState } from 'react'
import type { Lead } from '../lib/types'
import { supabase } from '../lib/supabase'

const SMS_CHAR_LIMIT = 160

type SmsModalProps = {
  lead: Lead
  onClose: () => void
  onOutcome?: (outcome: 'texted' | 'not_sent') => void
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Lead'
}

function formatSmsHref(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, '')
  let normalized = digits
  if (digits.length === 10) {
    normalized = `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    normalized = `+${digits}`
  } else if (digits.length > 0) {
    normalized = `+${digits}`
  }
  return `sms:${normalized}?body=${encodeURIComponent(body)}`
}

function hasUsablePhone(phone: string | null): boolean {
  return Boolean(phone && phone.replace(/\D/g, '').length >= 10)
}

export default function SmsModal({ lead, onClose, onOutcome }: SmsModalProps) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        const res = await fetch('/api/draft-sms', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lead_id: lead.id }),
        })

        const body = (await res.json()) as {
          sms_draft?: string
          message?: string
        }

        if (!res.ok) {
          if (!cancelled) {
            setError(body.message ?? 'Could not generate SMS draft')
          }
          return
        }

        if (!cancelled) {
          setDraft(body.sms_draft?.trim() ?? '')
        }
      } catch {
        if (!cancelled) {
          setError('Could not generate SMS draft')
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

  const charCount = draft.length
  const phoneOk = hasUsablePhone(lead.phone)

  function handleOutcome(outcome: 'texted' | 'not_sent') {
    onOutcome?.(outcome)
    onClose()
  }

  const showOutcomes =
    Boolean(onOutcome) && Boolean(draft.trim()) && !loading && !error

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-modal-title"
    >
      <div className="w-full sm:max-w-lg max-h-[100dvh] sm:max-h-[90vh] flex flex-col bg-cream border border-mint sm:rounded-lg shadow-lg">
        <div className="bg-navy px-4 py-3 sm:rounded-t-lg shrink-0">
          <h2 id="sms-modal-title" className="font-heading text-xl text-white">
            Send Text
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
                <label htmlFor="sms-draft" className="font-label text-xs uppercase text-slate">
                  SMS draft
                </label>
                <textarea
                  id="sms-draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, SMS_CHAR_LIMIT))}
                  rows={4}
                  className="font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <p
                  className={`font-label text-xs mt-1 ${
                    charCount > SMS_CHAR_LIMIT ? 'text-coral' : 'text-slate'
                  }`}
                >
                  {charCount} / {SMS_CHAR_LIMIT} characters
                </p>
              </div>

              {!phoneOk ? (
                <p className="font-body text-sm text-coral">
                  No phone number on file for this lead
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-mint px-4 py-3 shrink-0 space-y-3">
          {showOutcomes ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleOutcome('texted')}
                className="font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy"
              >
                I Sent It
              </button>
              <button
                type="button"
                onClick={() => handleOutcome('not_sent')}
                className="font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30"
              >
                I Did Not Send
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30"
          >
            Close
          </button>
          {phoneOk && draft.trim() && !loading && !error ? (
            <a
              href={formatSmsHref(lead.phone!, draft.trim())}
              className="font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy inline-flex items-center"
            >
              Open in Messages
            </a>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
