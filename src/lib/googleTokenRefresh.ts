/**
 * Server-side Google OAuth access-token refresh.
 * Decrypted tokens exist only in function-local memory — never log them.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from './tokenCrypto'

const LOG_MODULE = 'googleTokenRefresh'

export type GoogleTokenRefreshErrorCode =
  | 'not_connected'
  | 'missing_refresh'
  | 'decrypt_failed'
  | 'encrypt_failed'
  | 'db_error'
  | 'refresh_failed'

export type GoogleTokenRefreshSuccess = {
  ok: true
  accessToken: string
}

export type GoogleTokenRefreshFailure = {
  ok: false
  code: GoogleTokenRefreshErrorCode
  needs_reconnect?: boolean
}

export type GoogleTokenRefreshResult =
  | GoogleTokenRefreshSuccess
  | GoogleTokenRefreshFailure

type GoogleOAuthTokenRow = {
  access_token_encrypted: string
  refresh_token_encrypted: string
  token_expires_at: string
}

type GoogleRefreshResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

function safeLog(
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  console.log(JSON.stringify({ module: LOG_MODULE, event, ...fields }))
}

function resolveSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim()
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL')
  return url
}

function getServiceSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(resolveSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getGoogleClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  if (!id) throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID')
  return id
}

function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!secret) throw new Error('Missing GOOGLE_OAUTH_CLIENT_SECRET')
  return secret
}

export function isAccessTokenExpired(tokenExpiresAt: string): boolean {
  const expiresMs = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(expiresMs)) return true
  return Date.now() >= expiresMs - 60_000
}

function decryptField(
  ciphertext: string,
  field: 'access_token' | 'refresh_token',
): string | GoogleTokenRefreshFailure {
  try {
    return decryptToken(ciphertext)
  } catch {
    safeLog('decrypt_failed', { field })
    return { ok: false, code: 'decrypt_failed', needs_reconnect: true }
  }
}

/**
 * Exchange refresh token for a new access token, re-encrypt, persist, return
 * plaintext access token for immediate API use (caller memory only).
 */
export async function refreshAccessToken(
  userEmail: string,
): Promise<GoogleTokenRefreshResult> {
  const email = userEmail.trim().toLowerCase()
  const admin = getServiceSupabase()

  const { data: row, error: fetchError } = await admin
    .from('google_oauth_tokens')
    .select('access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('user_email', email)
    .maybeSingle()

  if (fetchError) {
    safeLog('db_fetch_failed', { reason: 'select_token_row' })
    return { ok: false, code: 'db_error' }
  }

  if (!row) {
    return { ok: false, code: 'not_connected', needs_reconnect: true }
  }

  const tokenRow = row as GoogleOAuthTokenRow
  const refreshPlain = decryptField(
    tokenRow.refresh_token_encrypted,
    'refresh_token',
  )
  if (typeof refreshPlain !== 'string') {
    return refreshPlain
  }

  if (!refreshPlain.trim()) {
    return { ok: false, code: 'missing_refresh', needs_reconnect: true }
  }

  let refreshResponse: Response
  try {
    refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getGoogleClientId(),
        client_secret: getGoogleClientSecret(),
        refresh_token: refreshPlain,
        grant_type: 'refresh_token',
      }),
    })
  } catch {
    safeLog('refresh_request_failed', { reason: 'network' })
    return { ok: false, code: 'refresh_failed', needs_reconnect: true }
  }

  let body: GoogleRefreshResponse
  try {
    body = (await refreshResponse.json()) as GoogleRefreshResponse
  } catch {
    safeLog('refresh_parse_failed', { status: refreshResponse.status })
    return { ok: false, code: 'refresh_failed', needs_reconnect: true }
  }

  if (!refreshResponse.ok || !body.access_token) {
    safeLog('refresh_http_error', {
      status: refreshResponse.status,
      google_error: body.error,
    })
    return { ok: false, code: 'refresh_failed', needs_reconnect: true }
  }

  const expiresIn = body.expires_in ?? 3600
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  let accessEncrypted: string
  try {
    accessEncrypted = encryptToken(body.access_token)
  } catch {
    safeLog('encrypt_failed', { field: 'access_token' })
    return { ok: false, code: 'encrypt_failed' }
  }

  const updatePayload: Record<string, string> = {
    access_token_encrypted: accessEncrypted,
    token_expires_at: tokenExpiresAt,
    last_refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (body.refresh_token) {
    try {
      updatePayload.refresh_token_encrypted = encryptToken(body.refresh_token)
    } catch {
      safeLog('encrypt_failed', { field: 'refresh_token' })
      return { ok: false, code: 'encrypt_failed' }
    }
  }

  const { error: updateError } = await admin
    .from('google_oauth_tokens')
    .update(updatePayload)
    .eq('user_email', email)

  if (updateError) {
    safeLog('db_update_failed', { reason: 'persist_refreshed_tokens' })
    return { ok: false, code: 'db_error' }
  }

  safeLog('refresh_succeeded', { user_email: email })
  return { ok: true, accessToken: body.access_token }
}

/**
 * Return a valid access token, refreshing first when expired or within skew.
 */
export async function getValidAccessToken(
  userEmail: string,
): Promise<GoogleTokenRefreshResult> {
  const email = userEmail.trim().toLowerCase()
  const admin = getServiceSupabase()

  const { data: row, error: fetchError } = await admin
    .from('google_oauth_tokens')
    .select('access_token_encrypted, refresh_token_encrypted, token_expires_at')
    .eq('user_email', email)
    .maybeSingle()

  if (fetchError) {
    safeLog('db_fetch_failed', { reason: 'select_token_row' })
    return { ok: false, code: 'db_error' }
  }

  if (!row) {
    return { ok: false, code: 'not_connected', needs_reconnect: true }
  }

  const tokenRow = row as GoogleOAuthTokenRow

  if (!isAccessTokenExpired(tokenRow.token_expires_at)) {
    const accessPlain = decryptField(
      tokenRow.access_token_encrypted,
      'access_token',
    )
    if (typeof accessPlain !== 'string') {
      return accessPlain
    }
    if (accessPlain.trim()) {
      return { ok: true, accessToken: accessPlain }
    }
  }

  return refreshAccessToken(email)
}
