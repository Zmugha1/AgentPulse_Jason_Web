import { useEffect, useRef, useState } from 'react'
import type { Lead } from '../lib/types'

export type ClosedConfirmResult = {
  skip: boolean
  closingPrice: number | null
  notes: string | null
}

type DoneMenuProps = {
  lead: Lead
  onNotInterested: () => void
  onClosedConfirm: (result: ClosedConfirmResult) => void
  onArchive: () => void
  onClose: () => void
  busy?: boolean
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Lead'
}

function parsePriceInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export default function DoneMenu({
  lead,
  onNotInterested,
  onClosedConfirm,
  onArchive,
  onClose,
  busy = false,
}: DoneMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [closingOpen, setClosingOpen] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [priceError, setPriceError] = useState<string | null>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [onClose])

  function handleNotInterested() {
    if (busy) return
    onNotInterested()
    onClose()
  }

  function handleWeClosedClick() {
    if (busy) return
    setClosingOpen(true)
    setPriceError(null)
  }

  function handleArchive() {
    if (busy) return
    onArchive()
    onClose()
  }

  function handleSkip() {
    if (busy) return
    onClosedConfirm({ skip: true, closingPrice: null, notes: null })
    onClose()
  }

  function handleSaveAndClose() {
    if (busy) return
    const trimmedPrice = priceInput.trim()
    if (trimmedPrice) {
      const parsed = parsePriceInput(trimmedPrice)
      if (parsed === null) {
        setPriceError('Enter a valid closing price or leave blank')
        return
      }
      onClosedConfirm({
        skip: false,
        closingPrice: parsed,
        notes: notesInput.trim() || null,
      })
      onClose()
      return
    }

    onClosedConfirm({
      skip: false,
      closingPrice: null,
      notes: notesInput.trim() || null,
    })
    onClose()
  }

  const optionClass =
    'font-body text-sm text-navy w-full text-left px-4 py-2 hover:bg-cream transition-colors disabled:opacity-50'

  if (closingOpen) {
    return (
      <div
        ref={menuRef}
        role="dialog"
        aria-label={`Closing context for ${displayName(lead)}`}
        className="absolute right-0 top-full z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] bg-white border border-mint rounded shadow-sm p-4 space-y-3"
      >
        <p className="font-heading text-base text-navy">
          Congratulations on closing this deal.
        </p>

        <div>
          <label
            htmlFor={`closing-price-${lead.id}`}
            className="font-label text-[10px] uppercase text-slate tracking-wide"
          >
            Closing price (optional)
          </label>
          <input
            id={`closing-price-${lead.id}`}
            type="text"
            inputMode="decimal"
            placeholder="$450,000"
            value={priceInput}
            disabled={busy}
            onChange={(e) => {
              setPriceInput(e.target.value)
              setPriceError(null)
            }}
            className="font-body text-sm w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-50"
          />
          {priceError ? (
            <p className="font-body text-coral text-xs mt-1" role="alert">
              {priceError}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor={`closing-notes-${lead.id}`}
            className="font-label text-[10px] uppercase text-slate tracking-wide"
          >
            Notes (optional)
          </label>
          <textarea
            id={`closing-notes-${lead.id}`}
            rows={2}
            placeholder="e.g. Buyer was a Realtor.com lead, 3 calls to close, met at open house"
            value={notesInput}
            disabled={busy}
            onChange={(e) => setNotesInput(e.target.value)}
            className="font-body text-sm w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal resize-y disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={handleSkip}
            className="font-body text-sm text-slate border border-mint rounded px-3 py-2 min-h-[40px] hover:bg-mint/30 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSaveAndClose}
            className="font-body text-sm text-white bg-teal border border-teal rounded px-3 py-2 min-h-[40px] hover:bg-navy hover:border-navy disabled:opacity-50"
          >
            Save and Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Done actions for ${displayName(lead)}`}
      className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] bg-white border border-mint rounded shadow-sm py-1"
    >
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={handleNotInterested}
        className={optionClass}
      >
        Not Interested
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={handleWeClosedClick}
        className={optionClass}
      >
        We Closed
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={handleArchive}
        className={`${optionClass} hover:text-coral`}
      >
        Archive
      </button>
    </div>
  )
}
