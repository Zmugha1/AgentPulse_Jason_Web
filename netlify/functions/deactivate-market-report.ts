import type { Handler } from '@netlify/functions'
import {
  getServiceSupabase,
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'deactivate-market-report'

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

    const { data, error } = await supabase
      .from('market_reports')
      .update({ is_active: false })
      .eq('id', reportId)
      .eq('user_email', userEmail)
      .eq('is_active', true)
      .select('id')
      .maybeSingle()

    if (error) {
      safeLog('deactivate_failed', {
        message: error.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to remove market report',
      })
    }

    if (!data) {
      return json(404, {
        code: 'not_found',
        message: 'Market report not found',
      })
    }

    safeLog('deactivated', { report_id: reportId, user_email: userEmail })
    return json(200, { success: true })
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
