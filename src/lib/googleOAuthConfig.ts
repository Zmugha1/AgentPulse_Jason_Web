export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
] as const

export function googleOAuthScopeString(): string {
  return GOOGLE_OAUTH_SCOPES.join(' ')
}

export function formatGrantedScopes(scopes: string[] | null | undefined): string {
  const list = scopes ?? []
  const labels: string[] = []
  if (list.some((s) => s.includes('gmail'))) labels.push('Gmail (read)')
  if (list.some((s) => s.includes('calendar'))) labels.push('Calendar (read)')
  return labels.length > 0 ? labels.join(', ') : 'Google account'
}

export function googleOAuthCallbackPath(): string {
  return '/auth/google/callback'
}
