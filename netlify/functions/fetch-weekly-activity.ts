import type { Handler } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'fetch-weekly-activity'
const CENTRAL_TZ = 'America/Chicago'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000
const RESPONSE_WINDOW_MS = 24 * MS_PER_HOUR
const PAGE_SIZE = 1000

const REALTOR_SOURCES = [
  'realtor.com',
  'realtor_com_full',
  'realtor_contacts',
  'realtor_com_connections_plus',
] as const

const ADVANCED_EXCLUDED_STAGES = ['new', 'inactive', 'dead'] as const

type WeekRange = {
  start: string
  end: string
}

type WeekMetrics = {
  new_leads: number
  leads_worked: number
  stages_advanced: number
  realtor_response_rate: number | null
  deals_closed: number
}

type WeeklyActivityResponse = {
  this_week: WeekMetrics
  last_week: WeekMetrics
  week_start: string
  generated_at: string
}

type CentralParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekdayIndex: number
}

function safeLog(
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  console.log(JSON.stringify({ module: LOG_MODULE, event, ...fields }))
}

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function getCentralParts(date: Date): CentralParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0'
    return Number(value)
  }
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const weekdayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
    weekdayIndex: weekdayMap[weekday] ?? 0,
  }
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  }
}

function centralLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, second)
  let candidate = targetMs - 7 * MS_PER_HOUR

  for (let i = 0; i < 24 * 60; i += 1) {
    const parts = getCentralParts(new Date(candidate))
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute &&
      parts.second === second
    ) {
      return new Date(candidate)
    }
    candidate += MS_PER_HOUR / 60
  }

  throw new Error('Failed to resolve US Central local time to UTC')
}

function getWeekRanges(now = new Date()): {
  thisWeek: WeekRange
  lastWeek: WeekRange
  weekStartUtc: Date
} {
  const central = getCentralParts(now)
  const monday = addCalendarDays(
    central.year,
    central.month,
    central.day,
    -central.weekdayIndex,
  )
  const weekStartUtc = centralLocalToUtc(
    monday.year,
    monday.month,
    monday.day,
    0,
    0,
    0,
  )
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * MS_PER_DAY)
  const lastWeekStartUtc = new Date(weekStartUtc.getTime() - 7 * MS_PER_DAY)

  return {
    thisWeek: {
      start: weekStartUtc.toISOString(),
      end: weekEndUtc.toISOString(),
    },
    lastWeek: {
      start: lastWeekStartUtc.toISOString(),
      end: weekStartUtc.toISOString(),
    },
    weekStartUtc,
  }
}

async function countLeadsInRange(
  supabase: SupabaseClient,
  range: WeekRange,
): Promise<number> {
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('original_lead_date', range.start)
    .lt('original_lead_date', range.end)

  if (error) {
    throw new Error(`countLeadsInRange: ${error.message}`)
  }
  return count ?? 0
}

async function countDistinctLeadsWorked(
  supabase: SupabaseClient,
  range: WeekRange,
): Promise<number> {
  const leadIds = new Set<string>()
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('interactions')
      .select('lead_id')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`countDistinctLeadsWorked: ${error.message}`)
    }
    if (!data?.length) break

    for (const row of data) {
      if (row.lead_id) leadIds.add(row.lead_id)
    }

    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return leadIds.size
}

async function countStagesAdvanced(
  supabase: SupabaseClient,
  range: WeekRange,
): Promise<number> {
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', range.start)
    .lt('updated_at', range.end)
    .not(
      'pipeline_stage',
      'in',
      `(${ADVANCED_EXCLUDED_STAGES.map((stage) => `"${stage}"`).join(',')})`,
    )

  if (error) {
    throw new Error(`countStagesAdvanced: ${error.message}`)
  }
  return count ?? 0
}

async function countDealsClosed(
  supabase: SupabaseClient,
  range: WeekRange,
): Promise<number> {
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_stage', 'closed')
    .gte('updated_at', range.start)
    .lt('updated_at', range.end)

  if (error) {
    throw new Error(`countDealsClosed: ${error.message}`)
  }
  return count ?? 0
}

type RealtorLeadRow = {
  id: string
  original_lead_date: string | null
}

async function fetchRealtorLeadsInRange(
  supabase: SupabaseClient,
  range: WeekRange,
): Promise<RealtorLeadRow[]> {
  const rows: RealtorLeadRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, original_lead_date')
      .in('source', [...REALTOR_SOURCES])
      .gte('original_lead_date', range.start)
      .lt('original_lead_date', range.end)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`fetchRealtorLeadsInRange: ${error.message}`)
    }
    if (!data?.length) break

    rows.push(...(data as RealtorLeadRow[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

async function fetchInteractionsForLeads(
  supabase: SupabaseClient,
  leadIds: string[],
): Promise<Array<{ lead_id: string; created_at: string }>> {
  if (leadIds.length === 0) return []

  const rows: Array<{ lead_id: string; created_at: string }> = []

  for (let i = 0; i < leadIds.length; i += PAGE_SIZE) {
    const batch = leadIds.slice(i, i + PAGE_SIZE)
    const { data, error } = await supabase
      .from('interactions')
      .select('lead_id, created_at')
      .in('lead_id', batch)

    if (error) {
      throw new Error(`fetchInteractionsForLeads: ${error.message}`)
    }
    if (data?.length) {
      rows.push(...(data as Array<{ lead_id: string; created_at: string }>))
    }
  }

  return rows
}

function calcRealtorResponseRate(
  leads: RealtorLeadRow[],
  interactions: Array<{ lead_id: string; created_at: string }>,
): number | null {
  const eligible = leads.filter((lead) => lead.original_lead_date)
  if (eligible.length === 0) return null

  const interactionsByLead = new Map<string, string[]>()
  for (const row of interactions) {
    const list = interactionsByLead.get(row.lead_id) ?? []
    list.push(row.created_at)
    interactionsByLead.set(row.lead_id, list)
  }

  let responded = 0
  for (const lead of eligible) {
    const leadMs = new Date(lead.original_lead_date!).getTime()
    const windowEnd = leadMs + RESPONSE_WINDOW_MS
    const leadInteractions = interactionsByLead.get(lead.id) ?? []
    const withinWindow = leadInteractions.some((createdAt) => {
      const ms = new Date(createdAt).getTime()
      return ms >= leadMs && ms < windowEnd
    })
    if (withinWindow) responded += 1
  }

  return Number(((responded / eligible.length) * 100).toFixed(1))
}

async function calcRealtorResponseRateForRange(
  supabase: SupabaseClient,
  range: WeekRange,
): Promise<number | null> {
  const leads = await fetchRealtorLeadsInRange(supabase, range)
  if (leads.length === 0) return null

  const leadIds = leads.map((lead) => lead.id)
  const interactions = await fetchInteractionsForLeads(supabase, leadIds)
  return calcRealtorResponseRate(leads, interactions)
}

async function queryNewLeads(
  supabase: SupabaseClient,
  thisWeek: WeekRange,
  lastWeek: WeekRange,
): Promise<{ thisWeek: number; lastWeek: number }> {
  const [thisWeekCount, lastWeekCount] = await Promise.all([
    countLeadsInRange(supabase, thisWeek),
    countLeadsInRange(supabase, lastWeek),
  ])
  return { thisWeek: thisWeekCount, lastWeek: lastWeekCount }
}

async function queryLeadsWorked(
  supabase: SupabaseClient,
  thisWeek: WeekRange,
  lastWeek: WeekRange,
): Promise<{ thisWeek: number; lastWeek: number }> {
  const [thisWeekCount, lastWeekCount] = await Promise.all([
    countDistinctLeadsWorked(supabase, thisWeek),
    countDistinctLeadsWorked(supabase, lastWeek),
  ])
  return { thisWeek: thisWeekCount, lastWeek: lastWeekCount }
}

async function queryStagesAdvanced(
  supabase: SupabaseClient,
  thisWeek: WeekRange,
  lastWeek: WeekRange,
): Promise<{ thisWeek: number; lastWeek: number }> {
  const [thisWeekCount, lastWeekCount] = await Promise.all([
    countStagesAdvanced(supabase, thisWeek),
    countStagesAdvanced(supabase, lastWeek),
  ])
  return { thisWeek: thisWeekCount, lastWeek: lastWeekCount }
}

async function queryRealtorResponseRate(
  supabase: SupabaseClient,
  thisWeek: WeekRange,
  lastWeek: WeekRange,
): Promise<{ thisWeek: number | null; lastWeek: number | null }> {
  const [thisWeekRate, lastWeekRate] = await Promise.all([
    calcRealtorResponseRateForRange(supabase, thisWeek),
    calcRealtorResponseRateForRange(supabase, lastWeek),
  ])
  return { thisWeek: thisWeekRate, lastWeek: lastWeekRate }
}

async function queryDealsClosed(
  supabase: SupabaseClient,
  thisWeek: WeekRange,
  lastWeek: WeekRange,
): Promise<{ thisWeek: number; lastWeek: number }> {
  const [thisWeekCount, lastWeekCount] = await Promise.all([
    countDealsClosed(supabase, thisWeek),
    countDealsClosed(supabase, lastWeek),
  ])
  return { thisWeek: thisWeekCount, lastWeek: lastWeekCount }
}

function assertSettled<T>(
  result: PromiseSettledResult<T>,
  label: string,
): T {
  if (result.status === 'fulfilled') {
    return result.value
  }
  const message =
    result.reason instanceof Error
      ? result.reason.message
      : String(result.reason)
  throw new Error(`${label}: ${message}`)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

    const supabase = getServiceSupabase()
    const { thisWeek, lastWeek, weekStartUtc } = getWeekRanges()
    const generatedAt = new Date().toISOString()

    safeLog('fetch_started', {
      week_start: weekStartUtc.toISOString(),
    })

    const [
      newLeadsSettled,
      leadsWorkedSettled,
      stagesAdvancedSettled,
      realtorRateSettled,
      dealsClosedSettled,
    ] = await Promise.allSettled([
      queryNewLeads(supabase, thisWeek, lastWeek),
      queryLeadsWorked(supabase, thisWeek, lastWeek),
      queryStagesAdvanced(supabase, thisWeek, lastWeek),
      queryRealtorResponseRate(supabase, thisWeek, lastWeek),
      queryDealsClosed(supabase, thisWeek, lastWeek),
    ])

    const newLeads = assertSettled(newLeadsSettled, 'new_leads')
    const leadsWorked = assertSettled(leadsWorkedSettled, 'leads_worked')
    const stagesAdvanced = assertSettled(stagesAdvancedSettled, 'stages_advanced')
    const realtorRate = assertSettled(realtorRateSettled, 'realtor_response_rate')
    const dealsClosed = assertSettled(dealsClosedSettled, 'deals_closed')

    const response: WeeklyActivityResponse = {
      this_week: {
        new_leads: newLeads.thisWeek,
        leads_worked: leadsWorked.thisWeek,
        stages_advanced: stagesAdvanced.thisWeek,
        realtor_response_rate: realtorRate.thisWeek,
        deals_closed: dealsClosed.thisWeek,
      },
      last_week: {
        new_leads: newLeads.lastWeek,
        leads_worked: leadsWorked.lastWeek,
        stages_advanced: stagesAdvanced.lastWeek,
        realtor_response_rate: realtorRate.lastWeek,
        deals_closed: dealsClosed.lastWeek,
      },
      week_start: weekStartUtc.toISOString(),
      generated_at: generatedAt,
    }

    safeLog('fetch_completed', {
      week_start: response.week_start,
      this_week_new_leads: response.this_week.new_leads,
      this_week_leads_worked: response.this_week.leads_worked,
    })

    return json(200, response as unknown as Record<string, unknown>)
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { code: 'unauthenticated' })
    }
    const message = err instanceof Error ? err.message : String(err)
    safeLog('fetch_failed', { message: message.slice(0, 200) })
    return json(500, { code: 'internal_error', message })
  }
}
