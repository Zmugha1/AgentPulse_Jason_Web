import type { Handler } from '@netlify/functions'
import { randomUUID } from 'crypto'
import {
  OAuthAuthError,
  buildGoogleAuthUrl,
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
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = user.email!.trim().toLowerCase()
    const state = randomUUID()
    const admin = getServiceSupabase()

    await admin.from('oauth_state').delete().eq('user_email', userEmail)

    const { error: insertError } = await admin.from('oauth_state').insert({
      state_token: state,
      user_email: userEmail,
    })
    if (insertError) {
      console.error('[google-oauth-start] state insert failed:', insertError.message)
      return json(500, { error: 'Failed to start OAuth flow' })
    }

    const url = buildGoogleAuthUrl(event, state)
    return json(200, { url })
  } catch (err) {
    if (err instanceof OAuthAuthError) {
      return json(401, { error: err.message })
    }
    console.error('[google-oauth-start] unexpected error:', err)
    return json(500, { error: 'Internal server error' })
  }
}
