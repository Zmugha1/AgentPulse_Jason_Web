import type { Handler } from '@netlify/functions'
import { encryptToken } from '../../src/lib/tokenCrypto'
import { GOOGLE_OAUTH_SCOPES } from '../../src/lib/googleOAuthConfig'
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
  getServiceSupabase,
  integrationsRedirect,
  isStateExpired,
} from './google-oauth-shared'

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

type GoogleUserInfo = {
  email?: string
}

function redirect(event: Parameters<Handler>[0], params: Record<string, string>) {
  return {
    statusCode: 302,
    headers: {
      Location: integrationsRedirect(event, params),
    },
    body: '',
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return redirect(event, { status: 'error', reason: 'method_not_allowed' })
  }

  const params = event.queryStringParameters ?? {}
  const oauthError = params.error
  if (oauthError === 'access_denied') {
    return redirect(event, { status: 'error', reason: 'denied' })
  }

  const code = params.code?.trim()
  const state = params.state?.trim()
  if (!code || !state) {
    return redirect(event, { status: 'error', reason: 'invalid_state' })
  }

  const admin = getServiceSupabase()
  const { data: stateRow, error: stateError } = await admin
    .from('oauth_state')
    .select('state_token, user_email, created_at')
    .eq('state_token', state)
    .maybeSingle()

  if (stateError || !stateRow) {
    console.error('[google-oauth-callback] state lookup failed:', stateError?.message)
    return redirect(event, { status: 'error', reason: 'invalid_state' })
  }

  if (isStateExpired(stateRow.created_at)) {
    await admin.from('oauth_state').delete().eq('state_token', state)
    return redirect(event, { status: 'error', reason: 'invalid_state' })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: getGoogleRedirectUri(event),
    }),
  })

  const tokenJson = (await tokenRes.json()) as GoogleTokenResponse
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error(
      '[google-oauth-callback] token exchange failed:',
      tokenJson.error ?? tokenRes.status,
    )
    return redirect(event, { status: 'error', reason: 'token_exchange_failed' })
  }

  const userInfoRes = await fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    },
  )
  const userInfo = (await userInfoRes.json()) as GoogleUserInfo
  if (!userInfoRes.ok || !userInfo.email) {
    console.error('[google-oauth-callback] userinfo failed:', userInfoRes.status)
    return redirect(event, { status: 'error', reason: 'token_exchange_failed' })
  }

  const userEmail = stateRow.user_email.trim().toLowerCase()
  const googleEmail = userInfo.email.trim().toLowerCase()
  const expiresIn = tokenJson.expires_in ?? 3600
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const scopes =
    tokenJson.scope?.split(' ').filter(Boolean) ??
    [...GOOGLE_OAUTH_SCOPES]

  const { data: existing } = await admin
    .from('google_oauth_tokens')
    .select('refresh_token_encrypted')
    .eq('user_email', userEmail)
    .eq('google_email', googleEmail)
    .maybeSingle()

  let refreshTokenEncrypted: string
  if (tokenJson.refresh_token) {
    refreshTokenEncrypted = encryptToken(tokenJson.refresh_token)
  } else if (existing?.refresh_token_encrypted) {
    refreshTokenEncrypted = existing.refresh_token_encrypted
  } else {
    refreshTokenEncrypted = encryptToken('')
  }

  const payload = {
    user_email: userEmail,
    google_email: googleEmail,
    access_token_encrypted: encryptToken(tokenJson.access_token),
    refresh_token_encrypted: refreshTokenEncrypted,
    token_expires_at: tokenExpiresAt,
    scopes_granted: scopes,
    connected_at: new Date().toISOString(),
    last_refreshed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error: upsertError } = await admin
    .from('google_oauth_tokens')
    .upsert(payload, { onConflict: 'user_email,google_email' })

  if (upsertError) {
    console.error('[google-oauth-callback] upsert failed:', upsertError.message)
    return redirect(event, { status: 'error', reason: 'token_exchange_failed' })
  }

  await admin.from('oauth_state').delete().eq('state_token', state)

  return redirect(event, { status: 'connected' })
}
