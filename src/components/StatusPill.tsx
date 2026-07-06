import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pencil } from 'lucide-react'
import type { Lead, LeadStatus } from '../lib/types'
import { getEffectiveStatus } from '../lib/types'

const STATUS_COLORS: Record<LeadStatus, string> = {
  hot: '#F05F57',
  warm: '#C8974A',
  cold: '#7A8F95',
  dead: '#2D4459',
}

const OVERRIDE_OPTIONS: { value: LeadStatus | null; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'dead', label: 'Archived' },
  { value: null, label: 'Reset to calculated' },
]

type StatusPillProps = {
  lead: Lead
  onOverride?: (leadId: string, status: LeadStatus | null) => void
  readonly?: boolean
}

function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function pillStyles(status: LeadStatus): CSSProperties {
  const color = STATUS_COLORS[status]
  return {
    color,
    backgroundColor: hexWithAlpha(color, 0.15),
    borderColor: hexWithAlpha(color, 0.4),
  }
}

function displayStatus(status: string): string {
  if (status === 'dead') return 'ARCHIVED'
  return status.toUpperCase()
}

export default function StatusPill({
  lead,
  onOverride,
  readonly = false,
}: StatusPillProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const effective = getEffectiveStatus(lead)
  const hasOverride = Boolean(lead.status_override?.trim())
  const overrideTooltip =
    'Manual override. Click to change or reset to calculated'

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSelect(value: LeadStatus | null) {
    setOpen(false)
    onOverride?.(lead.id, value)
  }

  const pillClass =
    'inline-flex items-center gap-1 font-label text-[10px] font-bold uppercase rounded border px-2 py-0.5'

  if (readonly) {
    return (
      <span className={pillClass} style={pillStyles(effective)}>
        {displayStatus(effective)}
        {hasOverride ? (
          <Pencil className="w-3 h-3 shrink-0" aria-hidden />
        ) : null}
      </span>
    )
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={hasOverride ? overrideTooltip : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${pillClass} cursor-pointer hover:opacity-80`}
        style={pillStyles(effective)}
      >
        {displayStatus(effective)}
        {hasOverride ? (
          <Pencil className="w-3 h-3 shrink-0" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded border border-mint bg-white shadow-lg py-1"
        >
          {OVERRIDE_OPTIONS.map((option) => (
            <li key={option.label}>
              <button
                type="button"
                role="option"
                onClick={() => handleSelect(option.value)}
                className="w-full text-left font-body text-xs text-navy px-3 py-2 hover:bg-mint/30"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
