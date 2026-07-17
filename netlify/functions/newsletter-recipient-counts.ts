import type { Handler } from '@netlify/functions'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'newsletter-recipient-counts'

type LeadStatus = 'hot' | 'warm' | 'cold'

type LeadRecipientRow = {
  id: string
  email: string | null
  status: string | null
  status_override: string | null
  is_archived: boolean | null
  last_contact_at: string | null
}

type RecipientCounts = {
  hot: number
  warm: number
  cold: number
  archived: number
  never_contacted: number
  total_with_email: number
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

function effectiveStatus(row: LeadRecipientRow): LeadStatus {
  const value = (row.status_override ?? row.status ?? 'cold').trim().toLowerCase()
  if (value === 'hot' || value === 'warm' || value === 'cold') {
    return value
  }
  return 'cold'
}

function countRows(rows: LeadRecipientRow[], archived: number): RecipientCounts {
  const counts: RecipientCounts = {
    hot: 0,
    warm: 0,
    cold: 0,
    archived,
    never_contacted: 0,
    total_with_email: rows.length,
  }

  for (const row of rows) {
    counts[effectiveStatus(row)] += 1
    if (!row.last_contact_at) {
      counts.never_contacted += 1
    }
  }

  return counts
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

    const supabase = getServiceSupabase()

    const { data: activeRows, error: activeError } = await supabase
      .from('leads')
      .select('id, email, status, status_override, is_archived, last_contact_at')
      .not('email', 'is', null)
      .neq('email', '')
      .like('email', '%@%')
      .eq('is_archived', false)

    if (activeError) {
      safeLog('active_leads_query_failed', {
        message: activeError.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to load recipient counts',
      })
    }

    const { count: archivedCount, error: archivedError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null)
      .neq('email', '')
      .like('email', '%@%')
      .eq('is_archived', true)

    if (archivedError) {
      safeLog('archived_leads_query_failed', {
        message: archivedError.message.slice(0, 200),
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to load recipient counts',
      })
    }

    const counts = countRows(
      (activeRows ?? []) as LeadRecipientRow[],
      archivedCount ?? 0,
    )

    safeLog('counts_loaded', {
      total_with_email: counts.total_with_email,
      archived: counts.archived,
    })

    return json(200, counts)
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
