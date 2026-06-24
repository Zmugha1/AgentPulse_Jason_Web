import type { Handler } from '@netlify/functions'
import type { LeadStatus } from '../../src/lib/types'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'update-lead-status-override'

const VALID_STATUSES = new Set<LeadStatus>(['hot', 'warm', 'cold', 'dead'])

type UpdateStatusOverrideBody = {
  lead_id?: unknown
  status_override?: unknown
  user_email?: unknown
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

function parseRequestBody(raw: string | null): UpdateStatusOverrideBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as UpdateStatusOverrideBody
  } catch {
    return null
  }
}

function requireLeadId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function requireEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseStatusOverride(
  value: unknown,
): LeadStatus | null | { error: string } {
  if (value === null) return null
  if (typeof value !== 'string') {
    return { error: 'status_override must be a string or null' }
  }
  const normalized = value.trim().toLowerCase()
  if (!VALID_STATUSES.has(normalized as LeadStatus)) {
    return { error: 'status_override must be hot, warm, cold, dead, or null' }
  }
  return normalized as LeadStatus
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const authEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    if (!body) {
      return json(400, { code: 'invalid_request', message: 'invalid JSON body' })
    }

    const leadId = requireLeadId(body.lead_id)
    const requestEmail = requireEmail(body.user_email)

    if (!leadId) {
      return json(400, { code: 'invalid_request', message: 'missing lead_id' })
    }
    if (!requestEmail) {
      return json(400, { code: 'invalid_request', message: 'missing user_email' })
    }
    if (normalizeEmail(requestEmail) !== authEmail) {
      return json(403, { code: 'forbidden', message: 'user_email mismatch' })
    }
    if (!('status_override' in body)) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing status_override',
      })
    }

    const overrideResult = parseStatusOverride(body.status_override)
    if (
      typeof overrideResult === 'object' &&
      overrideResult !== null &&
      'error' in overrideResult
    ) {
      return json(400, {
        code: 'invalid_request',
        message: overrideResult.error,
      })
    }

    const statusOverride = overrideResult

    const supabase = getServiceSupabase()

    const { data: existing, error: fetchError } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .maybeSingle()

    if (fetchError) {
      safeLog('lead_lookup_failed', { reason: 'db_error' })
      return json(500, { code: 'internal_error', message: 'Failed to load lead' })
    }
    if (!existing) {
      return json(404, { code: 'not_found', message: 'Lead not found' })
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        status_override: statusOverride,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    if (updateError) {
      safeLog('status_override_update_failed', { reason: 'db_error' })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to update status override',
      })
    }

    safeLog('status_override_updated', { lead_id: leadId })

    return json(200, { success: true, status_override: statusOverride })
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
