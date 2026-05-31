export type LeadFiltersState = {
  search: string
  status: string
  pipelineStage: string
  source: string
}

const PIPELINE_STAGES = [
  'new',
  'contacted',
  'attempted',
  'nurture',
  'appointment',
  'showing',
  'offer',
  'closed',
  'dead',
] as const

const SOURCES = [
  { value: 'zillow', label: 'Zillow' },
  { value: 'realtor_com_full', label: 'Realtor full' },
  { value: 'realtor_com_contacts', label: 'Realtor contacts' },
] as const

type LeadFiltersProps = {
  filters: LeadFiltersState
  onChange: (filters: LeadFiltersState) => void
}

const selectClass =
  'font-body w-full rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'

export default function LeadFilters({ filters, onChange }: LeadFiltersProps) {
  function update<K extends keyof LeadFiltersState>(
    key: K,
    value: LeadFiltersState[K],
  ) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="bg-white border border-mint rounded-lg p-4 space-y-4">
      <h2 className="font-heading text-lg text-navy">Filters</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
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
              <option key={stage} value={stage}>
                {stage}
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
            <option value="all">All sources</option>
            {SOURCES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
