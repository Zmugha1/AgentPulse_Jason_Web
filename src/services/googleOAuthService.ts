import { formatGrantedScopes } from '../lib/googleOAuthConfig'
import { supabase } from '../lib/supabase'

export type GoogleConnectionStatus = {
  connected: boolean
  google_email?: string
  connected_at?: Date
  scopes?: string[]
  scopesLabel?: string
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error('Not signed in')
  }
  return data.session.access_token
}

export async function getConnectionStatus(
  userEmail: string,
): Promise<GoogleConnectionStatus> {
  const email = userEmail.trim().toLowerCase()
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('google_email, connected_at, scopes_granted')
    .eq('user_email', email)
    .maybeSingle()

  if (error) {
    console.error('[googleOAuthService] getConnectionStatus:', error.message)
    throw new Error('Failed to load Google connection status')
  }

  if (!data) {
    return { connected: false }
  }

  const scopes = Array.isArray(data.scopes_granted)
    ? (data.scopes_granted as string[])
    : []

  return {
    connected: true,
    google_email: data.google_email ?? undefined,
    connected_at: data.connected_at ? new Date(data.connected_at) : undefined,
    scopes,
    scopesLabel: formatGrantedScopes(scopes),
  }
}

export async function initiateConnect(): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch('/api/google-oauth-start', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !body.url) {
    throw new Error(body.error ?? 'Failed to start Google connection')
  }
  window.location.href = body.url
}

export async function disconnectGoogle(_userEmail: string): Promise<void> {
  const token = await getAccessToken()
  const res = await fetch('/api/google-oauth-disconnect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json()) as { error?: string }
  if (!res.ok) {
    throw new Error(body.error ?? 'Failed to disconnect Google account')
  }
}
