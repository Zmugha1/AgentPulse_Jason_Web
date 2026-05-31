import { getSupabaseClient } from '../lib/getSupabaseClient'
import type {
  MarketIntelSummary,
  PriceBandRow,
  RecencyBucketRow,
  SourceBreakdown,
  StageDistributionRow,
} from '../lib/types'

type AnalyticsRow = {
  pipeline_stage: string | null
  source: string | null
  budget_max: number | null
  listing_price: number | null
  original_lead_date: string | null
}

const PIPELINE_ORDER = [
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

const ADVANCED_STAGES = new Set([
  'appointment',
  'showing',
  'offer',
  'closed',
])

type PriceBandKey =
  | 'under300k'
  | '300-450k'
  | '450-600k'
  | '600-800k'
  | '800kplus'

const PRICE_BAND_META: { key: PriceBandKey; label: string }[] = [
  { key: 'under300k', label: 'Under $300k' },
  { key: '300-450k', label: '$300k-$450k' },
  { key: '450-600k', label: '$450k-$600k' },
  { key: '600-800k', label: '$600k-$800k' },
  { key: '800kplus', label: '$800k+' },
]

type RecencyBucketKey = 'last12Months' | 'oneToThreeYears' | 'threePlusYears'

const RECENCY_BUCKET_LABELS: Record<RecencyBucketKey, string> = {
  last12Months: 'Last 12 months',
  oneToThreeYears: '1-3 years',
  threePlusYears: '3+ years',
}

function percent(count: number, total: number): number {
  if (!total) return 0
  return Number(((count / total) * 100).toFixed(1))
}

function normalizeStage(stage: string | null): string {
  const value = (stage ?? 'new').toLowerCase()
  return PIPELINE_ORDER.includes(value as (typeof PIPELINE_ORDER)[number])
    ? value
    : 'new'
}

function priceFor(row: AnalyticsRow): number | null {
  return row.budget_max ?? row.listing_price ?? null
}

function priceBandKey(price: number): PriceBandKey {
  if (price < 300_000) return 'under300k'
  if (price < 450_000) return '300-450k'
  if (price < 600_000) return '450-600k'
  if (price < 800_000) return '600-800k'
  return '800kplus'
}

function recencyBucketKey(
  rawDate: string | null,
  now: Date,
): RecencyBucketKey | null {
  if (!rawDate) return null
  const date = new Date(rawDate)
  if (Number.isNaN(date.getTime())) return null

  const ageMs = now.getTime() - date.getTime()
  const oneYear = 365 * 24 * 60 * 60 * 1000
  if (ageMs <= oneYear) return 'last12Months'
  if (ageMs <= oneYear * 3) return 'oneToThreeYears'
  return 'threePlusYears'
}

async function fetchAnalyticsRows(): Promise<AnalyticsRow[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('leads')
    .select(
      'pipeline_stage, source, budget_max, listing_price, original_lead_date',
    )

  if (error) {
    console.error('[marketIntelService] fetchAnalyticsRows:', error.message)
    throw new Error(`fetchAnalyticsRows: ${error.message}`)
  }

  return (data ?? []) as AnalyticsRow[]
}

/**
 * High-level lead counts for Market Intel header cards.
 */
export async function getTotalCounts(): Promise<MarketIntelSummary> {
  const rows = await fetchAnalyticsRows()
  let contacted = 0
  let newCount = 0
  let advanced = 0
  let closed = 0

  for (const row of rows) {
    const stage = normalizeStage(row.pipeline_stage)
    if (stage === 'contacted') contacted++
    if (stage === 'new') newCount++
    if (ADVANCED_STAGES.has(stage)) advanced++
    if (stage === 'closed') closed++
  }

  return {
    total: rows.length,
    contacted,
    new: newCount,
    advanced,
    closed,
  }
}

/**
 * Price band totals and advance rates (desktop J-2b).
 * Advance rate = share of leads in the band that reached appointment,
 * showing, offer, or closed.
 */
export async function getPriceBands(): Promise<PriceBandRow[]> {
  const rows = await fetchAnalyticsRows()
  const bands = new Map<PriceBandKey, { count: number; advanced: number }>(
    PRICE_BAND_META.map((b) => [b.key, { count: 0, advanced: 0 }]),
  )

  for (const row of rows) {
    const stage = normalizeStage(row.pipeline_stage)
    const price = priceFor(row)
    if (price === null) continue

    const key = priceBandKey(price)
    const band = bands.get(key)!
    band.count++
    if (ADVANCED_STAGES.has(stage)) band.advanced++
  }

  return PRICE_BAND_META.map(({ key, label }) => {
    const band = bands.get(key)!
    return {
      band: label,
      count: band.count,
      advanceRate: percent(band.advanced, band.count),
    }
  })
}

/**
 * Lead counts by import source (curated archive).
 */
export async function getSourceBreakdown(): Promise<SourceBreakdown> {
  const rows = await fetchAnalyticsRows()
  const breakdown: SourceBreakdown = {
    zillow: 0,
    realtor_full: 0,
    realtor_contacts: 0,
  }

  for (const row of rows) {
    const source = (row.source ?? '').toLowerCase()
    if (source === 'zillow') breakdown.zillow++
    else if (source === 'realtor_com_full') breakdown.realtor_full++
    else if (source === 'realtor_com_contacts') breakdown.realtor_contacts++
  }

  return breakdown
}

/**
 * Pipeline stage distribution in fixed funnel order.
 */
export async function getStageDistribution(): Promise<StageDistributionRow[]> {
  const rows = await fetchAnalyticsRows()
  const counts = new Map<string, number>(
    PIPELINE_ORDER.map((stage) => [stage, 0]),
  )

  for (const row of rows) {
    const stage = normalizeStage(row.pipeline_stage)
    counts.set(stage, (counts.get(stage) ?? 0) + 1)
  }

  return PIPELINE_ORDER.map((stage) => ({
    stage,
    count: counts.get(stage) ?? 0,
  }))
}

/**
 * Lead age buckets from original_lead_date (desktop J-2b opportunity age).
 */
export async function getRecencyBuckets(
  now = new Date(),
): Promise<RecencyBucketRow[]> {
  const rows = await fetchAnalyticsRows()
  const buckets = new Map<RecencyBucketKey, number>([
    ['last12Months', 0],
    ['oneToThreeYears', 0],
    ['threePlusYears', 0],
  ])

  for (const row of rows) {
    const key = recencyBucketKey(row.original_lead_date, now)
    if (!key) continue
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return (Object.keys(RECENCY_BUCKET_LABELS) as RecencyBucketKey[]).map(
    (key) => ({
      bucket: RECENCY_BUCKET_LABELS[key],
      count: buckets.get(key) ?? 0,
    }),
  )
}
