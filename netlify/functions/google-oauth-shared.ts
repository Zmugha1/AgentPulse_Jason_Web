import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { HandlerEvent } from '@netlify/functions'
import {
  googleOAuthCallbackPath,
  googleOAuthScopeString,
} from '../../src/lib/googleOAuthConfig'

const STATE_TTL_MS = 10 * 60 * 1000

export { STATE_TTL_MS }

export function resolveSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim()
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL')
  return url
}

export function getServiceSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(resolveSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function getAnonSupabase(): SupabaseClient {
  const key = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!key) throw new Error('Missing VITE_SUPABASE_ANON_KEY')
  return createClient(resolveSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function getBearerToken(event: HandlerEvent): string | null {
  const header =
    event.headers.authorization ??
    event.headers.Authorization ??
    ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

export async function requireAuthenticatedUser(
  event: HandlerEvent,
): Promise<User> {
  const token = getBearerToken(event)
  if (!token) {
    throw new OAuthAuthError('Missing Authorization bearer token')
  }
  const { data, error } = await getAnonSupabase().auth.getUser(token)
  if (error || !data.user?.email) {
    throw new OAuthAuthError('Invalid or expired session')
  }
  return data.user
}

export class OAuthAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OAuthAuthError'
  }
}

export function getAppOrigin(event: HandlerEvent): string {
  const hostHeader =
    event.headers['x-forwarded-host'] ??
    event.headers.host ??
    'agentpulseweb.netlify.app'
  const host = hostHeader.split(',')[0].trim()
  const protoHeader = event.headers['x-forwarded-proto'] ?? 'https'
  const proto = protoHeader.split(',')[0].trim()

  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return `http://${host}`
  }
  return `${proto}://${host}`
}

export function getGoogleRedirectUri(event: HandlerEvent): string {
  return `${getAppOrigin(event)}${googleOAuthCallbackPath()}`
}

export function integrationsRedirect(
  event: HandlerEvent,
  params: Record<string, string>,
): string {
  const origin = getAppOrigin(event)
  const query = new URLSearchParams(params).toString()
  return `${origin}/integrations?${query}`
}

export function getGoogleClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  if (!id) throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID')
  return id
}

export function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!secret) throw new Error('Missing GOOGLE_OAUTH_CLIENT_SECRET')
  return secret
}

export function buildGoogleAuthUrl(
  event: HandlerEvent,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    redirect_uri: getGoogleRedirectUri(event),
    scope: googleOAuthScopeString(),
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function isStateExpired(createdAt: string): boolean {
  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return true
  return Date.now() - createdMs > STATE_TTL_MS
}
