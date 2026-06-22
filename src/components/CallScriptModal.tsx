import { useEffect, useState } from 'react'
import type { Lead } from '../lib/types'
import { supabase } from '../lib/supabase'

export type CallScriptDraft = {
  opening: string
  reference: string
  question_1: string
  question_2: string
  close: string
}

type CallScriptModalProps = {
  lead: Lead
  onClose: () => void
}

const SCRIPT_CARDS: { key: keyof CallScriptDraft; label: string }[] = [
  { key: 'opening', label: 'Opening' },
  { key: 'reference', label: 'What to reference' },
  { key: 'question_1', label: 'Question 1' },
  { key: 'question_2', label: 'Question 2' },
  { key: 'close', label: 'How to close' },
]

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Lead'
}

function firstName(lead: Lead): string {
  return lead.first_name?.trim() || 'lead'
}

function formatTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  return `tel:+${digits}`
}

function hasUsablePhone(phone: string | null): boolean {
  return Boolean(phone && phone.replace(/\D/g, '').length >= 10)
}

function scriptToPlainText(script: CallScriptDraft): string {
  return SCRIPT_CARDS.map((card) => `${card.label}:\n${script[card.key]}`).join(
    '\n\n',
  )
}

export default function CallScriptModal({ lead, onClose }: CallScriptModalProps) {
  const [script, setScript] = useState<CallScriptDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadScript() {
      setLoading(true)
      setError(null)

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const userEmail = sessionData.session?.user?.email
      if (sessionError || !token) {
        if (!cancelled) {
          setError('Please sign in again')
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/draft-call-script', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lead_id: lead.id,
            user_email: userEmail ?? undefined,
          }),
        })

        const payload = (await res.json()) as CallScriptDraft & {
          message?: string
        }

        if (!res.ok) {
          if (!cancelled) {
            setError(payload.message ?? 'Could not generate call script')
          }
          return
        }

        if (!cancelled) {
          setScript({
            opening: payload.opening ?? '',
            reference: payload.reference ?? '',
            question_1: payload.question_1 ?? '',
            question_2: payload.question_2 ?? '',
            close: payload.close ?? '',
          })
        }
      } catch {
        if (!cancelled) {
          setError('Could not generate call script')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadScript()
    return () => {
      cancelled = true
    }
  }, [lead.id])

  const phoneOk = hasUsablePhone(lead.phone)

  async function handleCopyScript() {
    if (!script) return
    try {
      await navigator.clipboard.writeText(scriptToPlainText(script))
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
      aria-labelledby="call-script-modal-title"
    >
      <div className="w-full sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col bg-cream border border-mint sm:rounded-lg shadow-lg">
        <div className="bg-navy px-4 py-3 sm:rounded-t-lg shrink-0">
          <h2 id="call-script-modal-title" className="font-heading text-xl text-white">
            Call Prep
          </h2>
          <p className="font-body text-sm text-mint mt-1">
            Script for {displayName(lead)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <p className="font-body text-sm text-slate">Generating script...</p>
          ) : error ? (
            <p className="font-body text-sm text-coral" role="alert">
              {error}
            </p>
          ) : script ? (
            SCRIPT_CARDS.map((card) => (
              <div
                key={card.key}
                className="bg-white border border-mint rounded-lg p-3"
              >
                <div className="font-label text-[10px] uppercase text-slate">
                  {card.label}
                </div>
                <p className="font-body text-sm text-navy mt-2 leading-relaxed">
                  {script[card.key]}
                </p>
              </div>
            ))
          ) : null}
        </div>

        <div className="border-t border-mint px-4 py-3 flex flex-wrap gap-2 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30"
          >
            Close
          </button>
          {script && !loading && !error ? (
            <button
              type="button"
              onClick={() => void handleCopyScript()}
              className="font-body text-sm text-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-teal/10"
            >
              {copied ? 'Copied' : 'Copy script'}
            </button>
          ) : null}
          {phoneOk && script && !loading && !error ? (
            <a
              href={formatTelHref(lead.phone!)}
              className="font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy inline-flex items-center"
            >
              Call {firstName(lead)}
            </a>
          ) : (
            <span
              className="font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] inline-flex items-center opacity-60"
              title="No phone on file"
            >
              No phone on file
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
