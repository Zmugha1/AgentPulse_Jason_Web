import type { Handler } from '@netlify/functions'
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import type { google } from '@google-analytics/data/build/protos/protos'
import { OAuth2Client } from 'google-auth-library'
import { getValidAccessToken } from '../../src/lib/googleTokenRefresh'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'fetch-website-metrics'

// G-WBWHJYPG12 is the measurement/stream ID for thesuepattigroup.ai — NOT the Data API property ID.
// TODO: set GA4_PROPERTY_ID in Netlify env after locating numeric property ID in GA4 Admin.
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || 'TODO_NEEDS_PROPERTY_ID'

const ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/analytics.readonly'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

const LEAD_FORM_NAMES = ['chatbot-lead', 'seller-valuation'] as const

type MetricsRange = 'last_7_days' | 'last_30_days'

type MetricsRequestBody = {
  range?: unknown
}

type TopSourceRow = {
  source: string
  sessions: number
}

type TopPageRow = {
  page_title: string
  page_path: string
  views: number
}

type TrafficCategory =
  | 'Paid'
  | 'Email'
  | 'AI Assistant'
  | 'Listing Sites'
  | 'Social'
  | 'Google Search'
  | 'Referral'
  | 'Direct / Bookmark'

type TrafficSourceRow = {
  category: TrafficCategory
  sessions: number
  suggested_action: string
}

type MetricsResponse = {
  range: MetricsRange
  sessions: number
  users: number
  top_sources: TopSourceRow[]
  top_pages: TopPageRow[]
  traffic_sources: TrafficSourceRow[]
  lead_events: number
  lead_conversion_rate: number
  fetched_at: string
  cached: boolean
}

const TRAFFIC_SUGGESTED_ACTIONS: Record<TrafficCategory, string> = {
  Paid: 'Review ad spend ROI -- are these leads converting?',
  Email: 'Check which campaign drove this traffic',
  'AI Assistant':
    'AI tools are sending visitors -- your llms.txt is working',
  'Listing Sites':
    'Zillow and Realtor.com visitors -- make sure your profiles link here',
  Social: 'Social traffic detected -- consider posting more listings',
  'Google Search':
    'Organic search working -- keep adding neighborhood content',
  Referral: 'Someone linked to your site -- find out who and thank them',
  'Direct / Bookmark':
    'Direct visitors know your URL -- likely past clients or referrals',
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

function parseRequestBody(raw: string | null): MetricsRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as MetricsRequestBody
  } catch {
    return null
  }
}

function isMetricsRange(value: unknown): value is MetricsRange {
  return value === 'last_7_days' || value === 'last_30_days'
}

function cacheExpiresAtIso(): string {
  return new Date(Date.now() + CACHE_TTL_MS).toISOString()
}

function isCachedMetricsPayload(
  value: unknown,
): value is Omit<MetricsResponse, 'cached'> {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    isMetricsRange(record.range) &&
    typeof record.sessions === 'number' &&
    typeof record.users === 'number' &&
    Array.isArray(record.top_sources) &&
    Array.isArray(record.top_pages) &&
    Array.isArray(record.traffic_sources) &&
    typeof record.lead_events === 'number' &&
    typeof record.lead_conversion_rate === 'number' &&
    typeof record.fetched_at === 'string'
  )
}

function dateRangeForMetrics(range: MetricsRange): {
  startDate: string
  endDate: string
} {
  return range === 'last_30_days'
    ? { startDate: '30daysAgo', endDate: 'today' }
    : { startDate: '7daysAgo', endDate: 'today' }
}

function propertyResourceName(): string {
  return `properties/${GA4_PROPERTY_ID}`
}

function createAnalyticsClient(accessToken: string): BetaAnalyticsDataClient {
  const auth = new OAuth2Client()
  auth.setCredentials({
    access_token: accessToken,
    token_type: 'Bearer',
  })
  return new BetaAnalyticsDataClient({
    auth,
    fallback: true,
  })
}

function parseMetricInt(
  response: google.analytics.data.v1beta.IRunReportResponse,
  metricIndex: number,
): number {
  const raw = response.rows?.[0]?.metricValues?.[metricIndex]?.value
  if (!raw) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

function parseTopSources(
  response: google.analytics.data.v1beta.IRunReportResponse,
): TopSourceRow[] {
  return (response.rows ?? []).map((row) => ({
    source: row.dimensionValues?.[0]?.value?.trim() || '(unknown)',
    sessions: Number(row.metricValues?.[0]?.value ?? 0) || 0,
  }))
}

function parseTopPages(
  response: google.analytics.data.v1beta.IRunReportResponse,
): TopPageRow[] {
  return (response.rows ?? []).map((row) => ({
    page_title: row.dimensionValues?.[0]?.value?.trim() || '(untitled)',
    page_path: row.dimensionValues?.[1]?.value?.trim() || '/',
    views: Number(row.metricValues?.[0]?.value ?? 0) || 0,
  }))
}

function normalizeTrafficDimension(value: string | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase()
  if (!trimmed || trimmed === '(not set)') return ''
  return trimmed
}

function classifyTrafficCategory(
  referrerDomain: string,
  utmSource: string,
  utmMedium: string,
): TrafficCategory {
  const ref = normalizeTrafficDimension(referrerDomain)
  const src = normalizeTrafficDimension(utmSource)
  const med = normalizeTrafficDimension(utmMedium)

  if (
    med === 'cpc' ||
    med === 'paid' ||
    src.includes('google_ads') ||
    src.includes('facebook_ads')
  ) {
    return 'Paid'
  }

  if (
    med === 'email' ||
    ref.includes('mail.') ||
    ref.includes('outlook') ||
    src === 'newsletter'
  ) {
    return 'Email'
  }

  const aiDomains = [
    'chatgpt.com',
    'perplexity.ai',
    'claude.ai',
    'gemini.google.com',
    'copilot.microsoft.com',
    'you.com',
    'phind.com',
  ]
  if (src === 'ai_assistant' || aiDomains.some((domain) => ref.includes(domain))) {
    return 'AI Assistant'
  }

  const listingDomains = [
    'zillow.com',
    'realtor.com',
    'redfin.com',
    'homes.com',
    'trulia.com',
  ]
  if (listingDomains.some((domain) => ref.includes(domain))) {
    return 'Listing Sites'
  }

  const socialDomains = [
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'pinterest.com',
  ]
  if (socialDomains.some((domain) => ref.includes(domain))) {
    return 'Social'
  }

  if (ref.includes('google.') && med !== 'cpc') {
    return 'Google Search'
  }

  if (ref && ref !== 'direct') {
    return 'Referral'
  }

  if ((!ref || ref === 'direct') && !src) {
    return 'Direct / Bookmark'
  }

  return 'Referral'
}

function aggregateTrafficSources(
  response: google.analytics.data.v1beta.IRunReportResponse,
): TrafficSourceRow[] {
  const totals = new Map<TrafficCategory, number>()

  for (const row of response.rows ?? []) {
    const referrerDomain = row.dimensionValues?.[0]?.value ?? ''
    const utmSource = row.dimensionValues?.[1]?.value ?? ''
    const utmMedium = row.dimensionValues?.[2]?.value ?? ''
    const sessions = Number(row.metricValues?.[0]?.value ?? 0) || 0
    if (sessions <= 0) continue

    const category = classifyTrafficCategory(referrerDomain, utmSource, utmMedium)
    totals.set(category, (totals.get(category) ?? 0) + sessions)
  }

  return [...totals.entries()]
    .filter(([, sessions]) => sessions > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, sessions]) => ({
      category,
      sessions,
      suggested_action: TRAFFIC_SUGGESTED_ACTIONS[category],
    }))
}

function mapGaError(err: unknown): { statusCode: number; code: string } | null {
  if (!err || typeof err !== 'object') return null
  const record = err as { code?: number; message?: string }
  if (record.code === 5) {
    return { statusCode: 404, code: 'property_not_found' }
  }
  if (record.code === 7 || record.code === 16) {
    return { statusCode: 403, code: 'scope_insufficient' }
  }
  const message = record.message?.toLowerCase() ?? ''
  if (message.includes('not found') || message.includes('not_found')) {
    return { statusCode: 404, code: 'property_not_found' }
  }
  if (
    message.includes('permission') ||
    message.includes('insufficient') ||
    message.includes('denied')
  ) {
    return { statusCode: 403, code: 'scope_insufficient' }
  }
  return null
}

function submissionCutoffIso(range: MetricsRange): string {
  const days = range === 'last_30_days' ? 30 : 7
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function countRealWebsiteLeads(range: MetricsRange): Promise<number> {
  const supabase = getServiceSupabase()
  const cutoffIso = submissionCutoffIso(range)

  const { count, error } = await supabase
    .from('website_lead_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'imported')
    .in('netlify_form_name', [...LEAD_FORM_NAMES])
    .gte('submission_created_at', cutoffIso)

  if (error) {
    safeLog('lead_count_query_failed', { reason: 'db_error' })
    return 0
  }

  return count ?? 0
}

async function hasAnalyticsScope(userEmail: string): Promise<boolean> {
  const { data, error } = await getServiceSupabase()
    .from('google_oauth_tokens')
    .select('scopes_granted')
    .eq('user_email', userEmail)
    .maybeSingle()

  if (error) {
    safeLog('scope_lookup_failed', { reason: 'db_error' })
    return false
  }

  const scopes = data?.scopes_granted
  return (
    Array.isArray(scopes) && scopes.includes(ANALYTICS_READONLY_SCOPE)
  )
}

async function fetchGa4Metrics(
  client: BetaAnalyticsDataClient,
  range: MetricsRange,
): Promise<
  | {
      ok: true
      metrics: Omit<
        MetricsResponse,
        'range' | 'fetched_at' | 'cached' | 'lead_events' | 'lead_conversion_rate'
      >
    }
  | { ok: false; statusCode: number; code: string }
> {
  const dateRanges = [dateRangeForMetrics(range)]
  const property = propertyResourceName()

  try {
    const [summaryResponse] = await client.runReport({
      property,
      dateRanges,
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    })

    const [sourcesResponse] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 5,
    })

    const [pagesResponse] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 5,
    })

    const [trafficResponse] = await client.runReport({
      property,
      dateRanges,
      dimensions: [
        { name: 'referrer_domain' },
        { name: 'utm_source_captured' },
      ],
      metrics: [{ name: 'sessions' }],
      limit: 100,
    })

    const sessions = parseMetricInt(summaryResponse, 0)
    const users = parseMetricInt(summaryResponse, 1)
    const traffic_sources = aggregateTrafficSources(trafficResponse)

    safeLog('ga4_fetch_succeeded', {
      sessions,
      users,
      top_source_count: sourcesResponse.rows?.length ?? 0,
      top_page_count: pagesResponse.rows?.length ?? 0,
      traffic_source_category_count: traffic_sources.length,
    })

    return {
      ok: true,
      metrics: {
        sessions,
        users,
        top_sources: parseTopSources(sourcesResponse),
        top_pages: parseTopPages(pagesResponse),
        traffic_sources,
      },
    }
  } catch (err) {
    const mapped = mapGaError(err)
    if (mapped) {
      safeLog('ga4_fetch_failed', {
        status: mapped.statusCode,
        code: mapped.code,
      })
      return { ok: false, statusCode: mapped.statusCode, code: mapped.code }
    }
    safeLog('ga4_fetch_failed', {
      reason: 'unexpected',
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, statusCode: 500, code: 'internal_error' }
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    if (!body || !isMetricsRange(body.range)) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing range',
      })
    }
    const range = body.range

    const supabase = getServiceSupabase()
    const nowIso = new Date().toISOString()

    const { data: cachedRow, error: cacheError } = await supabase
      .from('ga4_metrics_cache')
      .select('metrics_data')
      .eq('user_email', userEmail)
      .eq('range', range)
      .gt('expires_at', nowIso)
      .maybeSingle()

    if (cacheError) {
      safeLog('cache_lookup_failed', { reason: 'db_error' })
    } else if (cachedRow) {
      const cachedPayload = cachedRow.metrics_data
      if (isCachedMetricsPayload(cachedPayload)) {
        safeLog('cache_hit', { user_email: userEmail, range })
        return json(200, {
          ...cachedPayload,
          cached: true,
        })
      }
      safeLog('cache_hit_invalid_payload', { user_email: userEmail, range })
    }

    if (!cacheError) {
      safeLog('cache_miss', { user_email: userEmail, range })
    }

    if (
      !GA4_PROPERTY_ID.trim() ||
      GA4_PROPERTY_ID === 'TODO_NEEDS_PROPERTY_ID'
    ) {
      safeLog('property_id_missing')
      return json(404, { code: 'property_not_found' })
    }

    const tokenResult = await getValidAccessToken(userEmail)
    if (!tokenResult.ok) {
      if (tokenResult.code === 'db_error' || tokenResult.code === 'encrypt_failed') {
        safeLog('token_unavailable', { reason: tokenResult.code })
        return json(500, { code: 'internal_error' })
      }
      safeLog('token_unavailable', { reason: tokenResult.code })
      return json(403, { code: 'scope_insufficient' })
    }

    const analyticsGranted = await hasAnalyticsScope(userEmail)
    if (!analyticsGranted) {
      safeLog('analytics_scope_missing', { user_email: userEmail })
      return json(403, { code: 'scope_insufficient' })
    }

    const client = createAnalyticsClient(tokenResult.accessToken)
    try {
      const result = await fetchGa4Metrics(client, range)
      if (!result.ok) {
        return json(result.statusCode, { code: result.code })
      }

      const lead_events = await countRealWebsiteLeads(range)
      const lead_conversion_rate =
        result.metrics.sessions > 0
          ? (lead_events / result.metrics.sessions) * 100
          : 0

      const response: MetricsResponse = {
        range,
        ...result.metrics,
        lead_events,
        lead_conversion_rate,
        fetched_at: new Date().toISOString(),
        cached: false,
      }

      const { error: upsertError } = await supabase.from('ga4_metrics_cache').upsert(
        {
          user_email: userEmail,
          range,
          metrics_data: response,
          fetched_at: response.fetched_at,
          expires_at: cacheExpiresAtIso(),
        },
        { onConflict: 'user_email,range' },
      )

      if (upsertError) {
        safeLog('cache_upsert_failed', { reason: 'db_error' })
      }

      return json(200, response as unknown as Record<string, unknown>)
    } finally {
      await client.close().catch(() => undefined)
    }
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { code: 'unauthenticated' })
    }
    safeLog('unexpected_error')
    return json(500, { code: 'internal_error' })
  }
}
