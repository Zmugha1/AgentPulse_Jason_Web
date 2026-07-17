import type { Handler } from '@netlify/functions'
import { getValidAccessToken } from '../../src/lib/googleTokenRefresh'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'send-newsletter'
const BATCH_SIZE = 50
const BATCH_DELAY_MS = 500
const FROM_HEADER = 'Jason Patti <jason@thesuepattigroup.com>'

type LeadStatus = 'hot' | 'warm' | 'cold'

type NewsletterFilters = {
  include_hot: boolean
  include_warm: boolean
  include_cold: boolean
  include_archived: boolean
  include_never_contacted: boolean
}

type SendNewsletterRequestBody = {
  subject?: unknown
  body?: unknown
  filters?: unknown
}

type LeadRecipientRow = {
  id: string
  email: string | null
  status: string | null
  status_override: string | null
  is_archived: boolean | null
  last_contact_at: string | null
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

function parseRequestBody(raw: string | null): SendNewsletterRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as SendNewsletterRequestBody
  } catch {
    return null
  }
}

function requireNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseFilters(value: unknown): NewsletterFilters | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const keys: (keyof NewsletterFilters)[] = [
    'include_hot',
    'include_warm',
    'include_cold',
    'include_archived',
    'include_never_contacted',
  ]
  for (const key of keys) {
    if (typeof raw[key] !== 'boolean') return null
  }
  return {
    include_hot: raw.include_hot as boolean,
    include_warm: raw.include_warm as boolean,
    include_cold: raw.include_cold as boolean,
    include_archived: raw.include_archived as boolean,
    include_never_contacted: raw.include_never_contacted as boolean,
  }
}

function effectiveStatus(row: LeadRecipientRow): LeadStatus {
  const value = (row.status_override ?? row.status ?? 'cold').trim().toLowerCase()
  if (value === 'hot' || value === 'warm' || value === 'cold') {
    return value
  }
  return 'cold'
}

function hasValidEmail(email: string | null): email is string {
  if (!email) return false
  const trimmed = email.trim()
  return trimmed.length > 0 && trimmed.includes('@')
}

function applyFilters(
  rows: LeadRecipientRow[],
  filters: NewsletterFilters,
): LeadRecipientRow[] {
  return rows.filter((row) => {
    if (!hasValidEmail(row.email)) return false

    const archived = Boolean(row.is_archived)
    if (archived && !filters.include_archived) return false
    if (!archived) {
      const status = effectiveStatus(row)
      if (status === 'hot' && !filters.include_hot) return false
      if (status === 'warm' && !filters.include_warm) return false
      if (status === 'cold' && !filters.include_cold) return false
    }

    if (!filters.include_never_contacted && !row.last_contact_at) {
      return false
    }

    return true
  })
}

function dedupeByEmail(rows: LeadRecipientRow[]): LeadRecipientRow[] {
  const seen = new Set<string>()
  const result: LeadRecipientRow[] = []
  for (const row of rows) {
    if (!hasValidEmail(row.email)) continue
    const key = normalizeEmail(row.email)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtmlBody(plainBody: string): string {
  const paragraphs = plainBody
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;background:#f7f7f7;">
  <div style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;background:#ffffff;">
    ${paragraphs || '<p></p>'}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
    <p style="font-size:12px;line-height:1.4;color:#666666;">
      You received this because you previously contacted The Sue Patti Group. Reply to unsubscribe.
    </p>
  </div>
</body>
</html>`
}

function encodeRfc2822Base64Url(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildRawEmail(recipientEmail: string, subject: string, htmlBody: string): string {
  return [
    `From: ${FROM_HEADER}`,
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].join('\r\n')
}

async function gmailSend(
  accessToken: string,
  rawEncoded: string,
): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawEncoded }),
    },
  )

  return { ok: response.ok, status: response.status }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchAllLeadsWithEmail(): Promise<LeadRecipientRow[]> {
  const supabase = getServiceSupabase()
  const pageSize = 1000
  let from = 0
  const all: LeadRecipientRow[] = []

  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, email, status, status_override, is_archived, last_contact_at')
      .not('email', 'is', null)
      .neq('email', '')
      .like('email', '%@%')
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(`leads query failed: ${error.message}`)
    }

    const rows = (data ?? []) as LeadRecipientRow[]
    all.push(...rows)

    if (rows.length < pageSize) break
    from += pageSize
  }

  return all
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const body = parseRequestBody(event.body)
    const subject = requireNonEmptyString(body?.subject)
    const newsletterBody = requireNonEmptyString(body?.body)
    const filters = parseFilters(body?.filters)

    if (!subject) {
      return json(400, { code: 'invalid_request', message: 'missing subject' })
    }
    if (!newsletterBody) {
      return json(400, { code: 'invalid_request', message: 'missing body' })
    }
    if (!filters) {
      return json(400, { code: 'invalid_request', message: 'missing or invalid filters' })
    }

    const tokenResult = await getValidAccessToken(userEmail)
    if (!tokenResult.ok) {
      safeLog('token_unavailable', { reason: tokenResult.code })
      return json(403, {
        code: 'google_not_connected',
        message:
          'Google account not connected. Please reconnect in Integrations.',
      })
    }

    let leads: LeadRecipientRow[]
    try {
      leads = await fetchAllLeadsWithEmail()
    } catch (err) {
      safeLog('leads_query_failed', {
        message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to load newsletter recipients',
      })
    }

    const recipients = dedupeByEmail(applyFilters(leads, filters))
    if (recipients.length === 0) {
      return json(400, {
        code: 'no_recipients',
        message: 'No recipients match selected filters',
      })
    }

    const htmlBody = buildHtmlBody(newsletterBody)
    let sent = 0
    let failed = 0
    const failedEmails: string[] = []

    safeLog('send_started', {
      recipient_count: recipients.length,
      subject_length: subject.length,
    })

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)

      for (const lead of batch) {
        const recipientEmail = lead.email!.trim()
        try {
          const raw = buildRawEmail(recipientEmail, subject, htmlBody)
          const encoded = encodeRfc2822Base64Url(raw)
          const result = await gmailSend(tokenResult.accessToken, encoded)
          if (result.ok) {
            sent += 1
          } else {
            failed += 1
            failedEmails.push(recipientEmail)
            safeLog('send_failed', {
              status: result.status,
              email_domain: recipientEmail.split('@')[1] ?? 'unknown',
            })
          }
        } catch (err) {
          failed += 1
          failedEmails.push(recipientEmail)
          safeLog('send_exception', {
            message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
          })
        }
      }

      if (i + BATCH_SIZE < recipients.length) {
        await delay(BATCH_DELAY_MS)
      }
    }

    safeLog('send_completed', {
      sent,
      failed,
      total_recipients: recipients.length,
    })

    return json(200, {
      sent,
      failed,
      total_recipients: recipients.length,
      failed_emails: failedEmails,
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
