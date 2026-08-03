import type { Handler } from '@netlify/functions'
import {
  getServiceSupabase,
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'get-active-market-report'

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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)
    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('market_reports')
      .select(
        'id, user_email, area, report_period, extracted_stats, raw_text, uploaded_at, is_active',
      )
      .eq('user_email', userEmail)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })

    if (error) {
      safeLog('lookup_failed', {
        message: error.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to load market report',
      })
    }

    const reports = data ?? []

    safeLog('lookup_complete', {
      user_email: userEmail,
      report_count: reports.length,
    })

    return json(200, { reports })
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
