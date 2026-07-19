import type { Handler } from '@netlify/functions'
import {
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'get-listings'
const LISTINGS_PATH = 'src/data/listings.js'

type GitHubFileResponse = {
  sha?: string
  content?: string
  encoding?: string
  message?: string
}

export type WebsiteListing = {
  id: string
  address?: string
  price?: string
  status?: string
  headline?: string
  subheadline?: string
  cta?: string
  [key: string]: unknown
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

function getGitHubConfig(): {
  token: string
  repo: string
  branch: string
} | null {
  const token = process.env.GITHUB_TOKEN?.trim()
  const repo = process.env.GITHUB_REPO?.trim()
  const branch = process.env.GITHUB_BRANCH?.trim() || 'main'
  if (!token || !repo) return null
  return { token, repo, branch }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AgentPulse-Jason-Web',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function githubGetFile(
  repo: string,
  path: string,
  branch: string,
  token: string,
): Promise<{ sha: string; content: string }> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, { headers: githubHeaders(token) })
  const payload = (await res.json()) as GitHubFileResponse
  if (!res.ok) {
    const message = payload.message ?? `GitHub GET failed (${res.status})`
    throw new Error(message)
  }
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error('GitHub file content missing or not base64')
  }
  if (!payload.sha) {
    throw new Error('GitHub file sha missing')
  }
  return {
    sha: payload.sha,
    content: Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8'),
  }
}

function extractListingsArrayLiteral(source: string): string {
  const marker = source.match(/window\.LISTINGS\s*=\s*/)
  if (!marker || marker.index === undefined) {
    throw new Error('window.LISTINGS assignment not found')
  }
  const start = source.indexOf('[', marker.index + marker[0].length)
  if (start < 0) {
    throw new Error('LISTINGS array start not found')
  }

  let depth = 0
  let inString = false
  let stringQuote: '"' | "'" | null = null
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === stringQuote) {
        inString = false
        stringQuote = null
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringQuote = ch
      continue
    }
    if (ch === '[') depth += 1
    if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, i + 1)
      }
    }
  }

  throw new Error('LISTINGS array end not found')
}

function parseListings(source: string): WebsiteListing[] {
  const literal = extractListingsArrayLiteral(source)
  let parsed: unknown
  try {
    parsed = JSON.parse(literal)
  } catch {
    // listings.js is JSON-compatible object literals; fallback for edge cases
    // eslint-disable-next-line no-new-func
    parsed = new Function(`"use strict"; return (${literal});`)()
  }

  if (!Array.isArray(parsed)) {
    throw new Error('LISTINGS is not an array')
  }

  const listings: WebsiteListing[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || !row.id.trim()) continue
    listings.push(row as WebsiteListing)
  }
  return listings
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

    const github = getGitHubConfig()
    if (!github) {
      safeLog('github_config_missing')
      return json(500, {
        code: 'internal_error',
        message: 'GitHub publishing is not configured',
      })
    }

    safeLog('fetch_started')

    let file: { sha: string; content: string }
    try {
      file = await githubGetFile(github.repo, LISTINGS_PATH, github.branch, github.token)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_get_failed', { message: message.slice(0, 200) })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    let listings: WebsiteListing[]
    try {
      listings = parseListings(file.content)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('parse_failed', { message: message.slice(0, 200) })
      return json(500, {
        code: 'internal_error',
        message: 'Could not parse listings.js',
      })
    }

    safeLog('fetch_completed', { listing_count: listings.length })
    return json(200, {
      listings,
      sha: file.sha,
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
