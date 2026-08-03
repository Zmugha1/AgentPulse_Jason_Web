import type { Handler } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  getServiceSupabase,
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'generate-market-insights'
const INSIGHT_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 2000
const PAGE_SIZE = 1000

const SYSTEM_PROMPT = `You are a real estate market analyst helping an agent act on their pipeline using current MLS data. Be specific and action-oriented. Use only the numbers provided. Never invent statistics. Every insight must reference a real number from the report.`

type LeadSummaryRow = {
  email: string | null
  status: string | null
  status_override: string | null
  has_home_to_sell: boolean | null
  pipeline_stage: string | null
  last_contact_at: string | null
  original_lead_date: string | null
  score: number | null
}

type LeadCounts = {
  warm_with_email: number
  has_home_to_sell: number
  nurture_unresponsive: number
  hot_never_contacted: number
  stale_leads: number
}

type LeadFilter = {
  status: Array<'hot' | 'warm' | 'cold'> | null
  has_home_to_sell: boolean | null
  pipeline_stage: string | null
  never_contacted: boolean | null
  stale: boolean | null
}

type MarketInsight = {
  headline: string
  body: string
  lead_filter: LeadFilter
  action: string
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function parseRequestBody(raw: string | null): { report_id?: unknown } | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as { report_id?: unknown }
  } catch {
    return null
  }
}

function requireReportId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function effectiveStatus(row: LeadSummaryRow): 'hot' | 'warm' | 'cold' | 'dead' {
  const value = (row.status_override ?? row.status ?? 'cold').trim().toLowerCase()
  if (value === 'hot' || value === 'warm' || value === 'cold' || value === 'dead') {
    return value
  }
  return 'cold'
}

function hasUsableEmail(email: string | null): boolean {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
}

function leadAgeDays(originalLeadDate: string | null): number | null {
  if (!originalLeadDate) return null
  const d = new Date(originalLeadDate)
  if (Number.isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

/** Matches src/lib/leadStale.ts: cold, 365+ days, never contacted, stage new. */
function isStaleLead(row: LeadSummaryRow): boolean {
  const score = row.score ?? 0
  if (score > 3) return false
  const ageDays = leadAgeDays(row.original_lead_date)
  if (ageDays === null || ageDays <= 365) return false
  if (row.last_contact_at) return false
  return (row.pipeline_stage ?? 'new') === 'new'
}

function summarizeLeads(rows: LeadSummaryRow[]): LeadCounts {
  const counts: LeadCounts = {
    warm_with_email: 0,
    has_home_to_sell: 0,
    nurture_unresponsive: 0,
    hot_never_contacted: 0,
    stale_leads: 0,
  }

  for (const row of rows) {
    const status = effectiveStatus(row)
    if (status === 'warm' && hasUsableEmail(row.email)) {
      counts.warm_with_email += 1
    }
    if (row.has_home_to_sell === true) {
      counts.has_home_to_sell += 1
    }
    if ((row.pipeline_stage ?? '').toLowerCase() === 'nurture') {
      counts.nurture_unresponsive += 1
    }
    if (status === 'hot' && !row.last_contact_at) {
      counts.hot_never_contacted += 1
    }
    if (isStaleLead(row)) {
      counts.stale_leads += 1
    }
  }

  return counts
}

async function fetchActiveLeadRows(
  supabase: SupabaseClient,
): Promise<LeadSummaryRow[]> {
  const all: LeadSummaryRow[] = []
  let from = 0

  for (;;) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('leads')
      .select(
        'email, status, status_override, has_home_to_sell, pipeline_stage, last_contact_at, original_lead_date, score',
      )
      .eq('is_archived', false)
      .range(from, to)

    if (error) {
      throw new Error(error.message)
    }

    const page = (data ?? []) as LeadSummaryRow[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

function asNullableStringArray(
  value: unknown,
): Array<'hot' | 'warm' | 'cold'> | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return null
  const allowed = new Set(['hot', 'warm', 'cold'])
  const out: Array<'hot' | 'warm' | 'cold'> = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim().toLowerCase()
    if (allowed.has(normalized)) {
      out.push(normalized as 'hot' | 'warm' | 'cold')
    }
  }
  return out.length > 0 ? out : null
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  return null
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeInsight(raw: unknown): MarketInsight | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const headline = typeof obj.headline === 'string' ? obj.headline.trim() : ''
  const body = typeof obj.body === 'string' ? obj.body.trim() : ''
  const action = typeof obj.action === 'string' ? obj.action.trim() : ''
  if (!headline || !body || !action) return null

  const filterRaw =
    obj.lead_filter && typeof obj.lead_filter === 'object' && !Array.isArray(obj.lead_filter)
      ? (obj.lead_filter as Record<string, unknown>)
      : {}

  return {
    headline: headline.slice(0, 60),
    body,
    action,
    lead_filter: {
      status: asNullableStringArray(filterRaw.status),
      has_home_to_sell: asNullableBoolean(filterRaw.has_home_to_sell),
      pipeline_stage: asNullableString(filterRaw.pipeline_stage),
      never_contacted: asNullableBoolean(filterRaw.never_contacted),
      stale: asNullableBoolean(filterRaw.stale),
    },
  }
}

function parseInsightsPayload(raw: string): MarketInsight[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: unknown = null
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return []
      }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const insightsRaw = (parsed as { insights?: unknown }).insights
  if (!Array.isArray(insightsRaw)) return []

  const insights: MarketInsight[] = []
  for (const item of insightsRaw) {
    const normalized = normalizeInsight(item)
    if (normalized) insights.push(normalized)
    if (insights.length >= 4) break
  }
  return insights
}

async function callAnthropicForInsights(
  reportStats: Record<string, unknown>,
  leadCounts: LeadCounts,
  area: string,
  reportPeriod: string,
): Promise<MarketInsight[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const userPrompt = `MLS report context:
Area: ${area || 'Unknown'}
Period: ${reportPeriod || 'Unknown'}
Extracted stats (use only these numbers, never invent):
${JSON.stringify(reportStats, null, 2)}

Lead pipeline counts (use only these numbers):
- Warm leads with email: ${leadCounts.warm_with_email}
- Leads with a home to sell: ${leadCounts.has_home_to_sell}
- Leads in nurture / Unresponsive stage: ${leadCounts.nurture_unresponsive}
- Hot leads never contacted: ${leadCounts.hot_never_contacted}
- Stale leads (365+ days, no contact, stage new): ${leadCounts.stale_leads}

Return ONLY valid JSON with this shape:
{
  "insights": [
    {
      "headline": "string (under 60 chars, specific and urgent)",
      "body": "string (2-3 sentences, references specific numbers, explains why these leads should be contacted now)",
      "lead_filter": {
        "status": ["hot","warm"] or null,
        "has_home_to_sell": true or null,
        "pipeline_stage": "nurture" or null,
        "never_contacted": true or null,
        "stale": true or null
      },
      "action": "string (what the agent should say or do)"
    }
  ]
}

Rules:
- 3-4 insights maximum.
- Each insight must be grounded in real report numbers and lead counts above.
- No generic advice.
- Skip an insight if the matching lead count is 0.
- Return only JSON, no markdown, no preamble.`

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: INSIGHT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const rawText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()

  return parseInsightsPayload(rawText)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const reportId = requireReportId(body?.report_id)
    if (!reportId) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing report_id',
      })
    }

    const supabase = getServiceSupabase()

    const { data: report, error: reportError } = await supabase
      .from('market_reports')
      .select('id, area, report_period, extracted_stats, is_active')
      .eq('id', reportId)
      .eq('user_email', userEmail)
      .maybeSingle()

    if (reportError) {
      safeLog('report_lookup_failed', {
        message: reportError.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to load market report',
      })
    }

    if (!report) {
      return json(404, {
        code: 'not_found',
        message: 'Market report not found',
      })
    }

    let leadRows: LeadSummaryRow[]
    try {
      leadRows = await fetchActiveLeadRows(supabase)
    } catch (err) {
      safeLog('leads_query_failed', {
        message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to load lead summary',
      })
    }

    const leadCounts = summarizeLeads(leadRows)
    const stats =
      report.extracted_stats &&
      typeof report.extracted_stats === 'object' &&
      !Array.isArray(report.extracted_stats)
        ? (report.extracted_stats as Record<string, unknown>)
        : {}

    let insights: MarketInsight[]
    try {
      insights = await callAnthropicForInsights(
        stats,
        leadCounts,
        typeof report.area === 'string' ? report.area : '',
        typeof report.report_period === 'string' ? report.report_period : '',
      )
    } catch (err) {
      safeLog('anthropic_failed', {
        message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to generate market insights',
      })
    }

    if (insights.length === 0) {
      safeLog('empty_insights', { report_id: reportId })
      return json(500, {
        code: 'internal_error',
        message: 'Could not generate market insights',
      })
    }

    safeLog('insights_generated', {
      report_id: reportId,
      insight_count: insights.length,
      warm_with_email: leadCounts.warm_with_email,
      has_home_to_sell: leadCounts.has_home_to_sell,
      nurture_unresponsive: leadCounts.nurture_unresponsive,
      hot_never_contacted: leadCounts.hot_never_contacted,
      stale_leads: leadCounts.stale_leads,
    })

    return json(200, { insights })
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { code: 'unauthenticated' })
    }
    safeLog('unexpected_error', {
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    })
    return json(500, { code: 'internal_error', message: 'Unexpected error' })
  }
}
