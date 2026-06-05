import type { Handler } from '@netlify/functions'
import { decryptToken } from '../../src/lib/tokenCrypto'
import {
  OAuthAuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from './google-oauth-shared'

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = user.email!.trim().toLowerCase()
    const admin = getServiceSupabase()

    const { data: row, error: fetchError } = await admin
      .from('google_oauth_tokens')
      .select('refresh_token_encrypted')
      .eq('user_email', userEmail)
      .maybeSingle()

    if (fetchError) {
      console.error('[google-oauth-disconnect] fetch failed:', fetchError.message)
      return json(500, { error: 'Failed to load connection' })
    }

    if (row?.refresh_token_encrypted) {
      try {
        const refreshToken = decryptToken(row.refresh_token_encrypted)
        if (refreshToken) {
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshToken }),
          })
        }
      } catch (revokeErr) {
        console.error('[google-oauth-disconnect] revoke failed:', revokeErr)
      }
    }

    const { error: deleteError } = await admin
      .from('google_oauth_tokens')
      .delete()
      .eq('user_email', userEmail)

    if (deleteError) {
      console.error('[google-oauth-disconnect] delete failed:', deleteError.message)
      return json(500, { error: 'Failed to disconnect' })
    }

    return json(200, { ok: true })
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { error: err.message })
    }
    console.error('[google-oauth-disconnect] unexpected error:', err)
    return json(500, { error: 'Internal server error' })
  }
}
