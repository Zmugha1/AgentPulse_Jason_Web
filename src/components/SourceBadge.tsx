import { getSourceBadgeColor, getSourceLabel } from '../lib/leadSources'

const SLATE_BADGE = '#7A8F95'

type SourceBadgeProps = {
  source: string | null
  size?: 'sm' | 'md'
}

function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function SourceBadge({ source, size = 'sm' }: SourceBadgeProps) {
  const raw = source?.trim() ?? ''
  const isUnknown = !raw
  const label = isUnknown ? 'Unknown' : getSourceLabel(raw)
  const color = isUnknown ? SLATE_BADGE : getSourceBadgeColor(raw)

  const sizeClass =
    size === 'md'
      ? 'text-xs px-3 py-1'
      : 'text-[10px] px-2 py-0.5'

  return (
    <span
      className={`inline-flex items-center rounded border uppercase ${sizeClass}`}
      style={{
        fontFamily: '"Courier New", Courier, monospace',
        color,
        backgroundColor: hexWithAlpha(color, 0.15),
        borderColor: hexWithAlpha(color, 0.4),
      }}
    >
      {label}
    </span>
  )
}
