import { PIPELINE_STAGES } from '../lib/pipelineStages'
import { LEAD_SOURCE_FILTER_OPTIONS } from '../lib/leadSources'
import type { LeadSortBy } from '../pages/LeadIntelligence'

export type LeadFiltersState = {
  search: string
  status: string
  pipelineStage: string
  source: string
}

const SORT_OPTIONS: { value: LeadSortBy; label: string }[] = [
  { value: 'score_desc', label: 'Score (High to Low)' },
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'last_contact_desc', label: 'Last Contacted' },
  { value: 'days_in_pipeline_desc', label: 'Days in Pipeline' },
]

type LeadFiltersProps = {
  filters: LeadFiltersState
  onChange: (filters: LeadFiltersState) => void
  sortBy: LeadSortBy
  onSortChange: (sortBy: LeadSortBy) => void
  hideStale: boolean
  onHideStaleChange: (hideStale: boolean) => void
}

const selectClass =
  'font-body w-full rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'

export default function LeadFilters({
  filters,
  onChange,
  sortBy,
  onSortChange,
  hideStale,
  onHideStaleChange,
}: LeadFiltersProps) {
  function update<K extends keyof LeadFiltersState>(
    key: K,
    value: LeadFiltersState[K],
  ) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="bg-white border border-mint rounded-lg p-4 space-y-4">
      <h2 className="font-heading text-lg text-navy">Filters</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-5">
          <label htmlFor="lead-search" className={labelClass}>
            Search name
          </label>
          <input
            id="lead-search"
            type="search"
            placeholder="Name, email, or phone"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
            className={selectClass}
          />
        </div>

        <div>
          <label htmlFor="lead-status" className={labelClass}>
            Status
          </label>
          <select
            id="lead-status"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
            className={selectClass}
          >
            <option value="all">All statuses</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
        </div>

        <div>
          <label htmlFor="lead-stage" className={labelClass}>
            Pipeline stage
          </label>
          <select
            id="lead-stage"
            value={filters.pipelineStage}
            onChange={(e) => update('pipelineStage', e.target.value)}
            className={selectClass}
          >
            <option value="all">All stages</option>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lead-source" className={labelClass}>
            Source
          </label>
          <select
            id="lead-source"
            value={filters.source}
            onChange={(e) => update('source', e.target.value)}
            className={selectClass}
          >
            {LEAD_SOURCE_FILTER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lead-sort" className={labelClass}>
            Sort by
          </label>
          <select
            id="lead-sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as LeadSortBy)}
            className={selectClass}
          >
            {SORT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 font-body text-sm text-navy cursor-pointer">
        <input
          type="checkbox"
          checked={hideStale}
          onChange={(e) => onHideStaleChange(e.target.checked)}
          className="h-4 w-4 rounded border-mint text-teal focus:ring-teal"
        />
        Hide stale leads (365+ days, no contact)
      </label>
    </div>
  )
}
