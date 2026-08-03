import type { Handler } from '@netlify/functions'
import {
  getServiceSupabase,
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'toggle-market-report-prompts'

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

function parseRequestBody(
  raw: string | null,
): { report_id?: unknown; use_in_prompts?: unknown } | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as {
      report_id?: unknown
      use_in_prompts?: unknown
    }
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

    if (typeof body?.use_in_prompts !== 'boolean') {
      return json(400, {
        code: 'invalid_request',
        message: 'missing use_in_prompts boolean',
      })
    }

    const useInPrompts = body.use_in_prompts
    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('market_reports')
      .update({ use_in_prompts: useInPrompts })
      .eq('id', reportId)
      .eq('user_email', userEmail)
      .eq('is_active', true)
      .select('id, use_in_prompts')
      .maybeSingle()

    if (error) {
      safeLog('toggle_failed', {
        message: error.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to update market report',
      })
    }

    if (!data) {
      return json(404, {
        code: 'not_found',
        message: 'Market report not found',
      })
    }

    safeLog('toggled', {
      report_id: reportId,
      use_in_prompts: useInPrompts,
      user_email: userEmail,
    })

    return json(200, {
      success: true,
      use_in_prompts: data.use_in_prompts === true,
    })
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
