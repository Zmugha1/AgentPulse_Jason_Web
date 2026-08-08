import type { Handler } from '@netlify/functions'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'save-closing'

type SaveClosingBody = {
  lead_id?: unknown
  skip?: unknown
  closing_price?: unknown
  notes?: unknown
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

function parseRequestBody(raw: string | null): SaveClosingBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as SaveClosingBody
  } catch {
    return null
  }
}

function requireLeadId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

/**
 * Empty / whitespace → null.
 * Strips $, commas, spaces. Invalid non-empty → error string.
 */
function parseClosingPrice(
  value: unknown,
): number | null | { error: string } {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return { error: 'closing_price must be a non-negative number' }
    }
    return value
  }
  if (typeof value !== 'string') {
    return { error: 'closing_price must be a number or string' }
  }
  const trimmed = value.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: 'closing_price must be a non-negative number' }
  }
  return parsed
}

function parseNotes(value: unknown): string | null | { error: string } {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    return { error: 'notes must be a string' }
  }
  const trimmed = value.trim()
  return trimmed || null
}

function daysToCloseFrom(originalLeadDate: string | null): number | null {
  if (!originalLeadDate) return null
  const start = new Date(originalLeadDate)
  if (Number.isNaN(start.getTime())) return null
  const ms = Date.now() - start.getTime()
  if (ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    if (!body) {
      return json(400, { code: 'invalid_request', message: 'invalid JSON body' })
    }

    const leadId = requireLeadId(body.lead_id)
    if (!leadId) {
      return json(400, { code: 'invalid_request', message: 'missing lead_id' })
    }

    const skip = body.skip === true

    const priceResult = parseClosingPrice(body.closing_price)
    if (
      typeof priceResult === 'object' &&
      priceResult !== null &&
      'error' in priceResult
    ) {
      return json(400, { code: 'invalid_request', message: priceResult.error })
    }

    const notesResult = parseNotes(body.notes)
    if (
      typeof notesResult === 'object' &&
      notesResult !== null &&
      'error' in notesResult
    ) {
      return json(400, { code: 'invalid_request', message: notesResult.error })
    }

    const supabase = getServiceSupabase()

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, original_lead_date, source')
      .eq('id', leadId)
      .maybeSingle()

    if (leadError) {
      safeLog('lead_lookup_failed', {
        message: leadError.message.slice(0, 200),
      })
      return json(500, { code: 'internal_error', message: 'Failed to load lead' })
    }
    if (!lead) {
      return json(404, { code: 'not_found', message: 'Lead not found' })
    }

    if (!skip) {
      const { count, error: countError } = await supabase
        .from('interactions')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId)

      if (countError) {
        safeLog('interactions_count_failed', {
          message: countError.message.slice(0, 200),
        })
        return json(500, {
          code: 'internal_error',
          message: 'Failed to count interactions',
        })
      }

      const { data: report, error: reportError } = await supabase
        .from('market_reports')
        .select('id')
        .eq('user_email', userEmail)
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (reportError) {
        safeLog('market_report_lookup_failed', {
          message: reportError.message.slice(0, 200),
        })
        return json(500, {
          code: 'internal_error',
          message: 'Failed to load market report',
        })
      }

      const { error: insertClosingError } = await supabase.from('closings').insert({
        lead_id: leadId,
        user_email: userEmail,
        closing_price: priceResult,
        days_to_close: daysToCloseFrom(lead.original_lead_date),
        source: lead.source ?? null,
        interactions_count: count ?? 0,
        market_report_id: report?.id ?? null,
        notes: notesResult,
      })

      if (insertClosingError) {
        safeLog('closing_insert_failed', {
          message: insertClosingError.message.slice(0, 200),
        })
        return json(500, {
          code: 'internal_error',
          message: 'Failed to save closing',
        })
      }
    }

    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        pipeline_stage: 'closed',
        updated_at: now,
      })
      .eq('id', leadId)

    if (updateError) {
      safeLog('stage_update_failed', {
        message: updateError.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to update lead stage',
      })
    }

    const { error: interactionError } = await supabase.from('interactions').insert({
      lead_id: leadId,
      type: 'outcome',
      outcome: 'closed',
      notes: null,
      created_at: now,
    })

    if (interactionError) {
      safeLog('interaction_insert_failed', {
        message: interactionError.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to log closed interaction',
      })
    }

    safeLog('closing_saved', {
      lead_id: leadId,
      skip,
      user_email: userEmail,
    })

    return json(200, { ok: true })
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
