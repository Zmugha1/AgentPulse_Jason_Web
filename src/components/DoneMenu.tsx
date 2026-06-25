import { useEffect, useRef } from 'react'
import type { Lead } from '../lib/types'

type DoneMenuProps = {
  lead: Lead
  onNotInterested: () => void
  onClosed: () => void
  onArchive: () => void
  onClose: () => void
}

function displayName(lead: Lead): string {
  const name = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim()
  return name || lead.email || lead.phone || 'Lead'
}

export default function DoneMenu({
  lead,
  onNotInterested,
  onClosed,
  onArchive,
  onClose,
}: DoneMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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
    onNotInterested()
    onClose()
  }

  function handleClosed() {
    onClosed()
    onClose()
  }

  function handleArchive() {
    onArchive()
    onClose()
  }

  const optionClass =
    'font-body text-sm text-navy w-full text-left px-4 py-2 hover:bg-cream transition-colors'

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
        onClick={handleNotInterested}
        className={optionClass}
      >
        Not Interested
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleClosed}
        className={optionClass}
      >
        We Closed
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleArchive}
        className={`${optionClass} hover:text-coral`}
      >
        Archive
      </button>
    </div>
  )
}
