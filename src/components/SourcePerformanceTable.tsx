import type { SourcePerformanceRow } from '../services/marketIntelService'

type SourcePerformanceTableProps = {
  rows: SourcePerformanceRow[]
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatConversionRate(total: number, rate: number): string {
  if (total === 0) return '—'
  return `${rate.toFixed(1)}%`
}

function MetricCell({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="font-label text-[10px] uppercase text-slate tracking-wide md:hidden">
        {label}
      </div>
      <div className="font-body text-sm text-navy md:text-center">{value}</div>
    </div>
  )
}

function SourceRowCard({ row }: { row: SourcePerformanceRow }) {
  return (
    <div
      className="bg-cream border border-mint border-l-4 rounded-lg p-4 space-y-3"
      style={{ borderLeftColor: row.border_color }}
    >
      <div className="font-heading text-base text-navy">{row.source_group}</div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCell label="Total Leads" value={formatCount(row.total)} />
        <MetricCell label="Worked" value={formatCount(row.worked)} />
        <MetricCell label="Advanced" value={formatCount(row.advanced)} />
        <MetricCell label="Closed" value={formatCount(row.closed)} />
        <MetricCell
          label="Conversion Rate"
          value={formatConversionRate(row.total, row.conversion_rate)}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {row.insight ? (
        <p className="font-label text-xs text-slate leading-relaxed">{row.insight}</p>
      ) : null}
    </div>
  )
}

export default function SourcePerformanceTable({
  rows,
}: SourcePerformanceTableProps) {
  if (rows.length === 0) {
    return (
      <p className="font-body text-sm text-slate">
        No lead source data in your active pool yet.
      </p>
    )
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-mint">
              {[
                'Source',
                'Total Leads',
                'Worked',
                'Advanced',
                'Closed',
                'Conversion Rate',
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className={`font-label text-[10px] uppercase text-slate tracking-wide py-2 px-3 ${
                    heading === 'Source' ? 'text-left' : 'text-center'
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source_group} className="border-b border-mint/60">
                <td className="py-3 px-3 align-top">
                  <div
                    className="border-l-4 pl-3"
                    style={{ borderLeftColor: row.border_color }}
                  >
                    <div className="font-heading text-base text-navy">
                      {row.source_group}
                    </div>
                    {row.insight ? (
                      <p className="font-label text-xs text-slate mt-2 max-w-md leading-relaxed">
                        {row.insight}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="font-body text-sm text-navy text-center py-3 px-3 align-top">
                  {formatCount(row.total)}
                </td>
                <td className="font-body text-sm text-navy text-center py-3 px-3 align-top">
                  {formatCount(row.worked)}
                </td>
                <td className="font-body text-sm text-navy text-center py-3 px-3 align-top">
                  {formatCount(row.advanced)}
                </td>
                <td className="font-body text-sm text-navy text-center py-3 px-3 align-top">
                  {formatCount(row.closed)}
                </td>
                <td className="font-body text-sm text-navy text-center py-3 px-3 align-top">
                  {formatConversionRate(row.total, row.conversion_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <SourceRowCard key={row.source_group} row={row} />
        ))}
      </div>
    </>
  )
}
