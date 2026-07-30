import type { Handler } from '@netlify/functions'
import {
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'add-listing'
const LISTINGS_PATH = 'src/data/listings.js'
const ALLOWED_STATUSES = new Set(['active', 'under_contract', 'sold'])

const LISTINGS_FILE_HEADER = `// TO UPDATE A LISTING: edit this file only.
// Change headline, status, cta, or price here.
// No other files need to be touched.
// After editing, commit and push to go live.
//
// status values: "active" | "under_contract" | "sold"
// featured: true marks the Coming Soon estate-style card
// showOn: which pages render this listing ("home" = Coming Soon, "search" = Search page)

`

type GitHubFileResponse = {
  sha?: string
  content?: string
  encoding?: string
  message?: string
}

type GitHubPutResponse = {
  commit?: { sha?: string }
  content?: { sha?: string }
  message?: string
}

type WebsiteListing = {
  id: string
  address?: string
  price?: string
  status?: string
  headline?: string
  subheadline?: string
  cta?: string
  badge?: string
  image?: string
  ctaHref?: string
  featured?: boolean
  showOn?: string[]
  [key: string]: unknown
}

type AddListingRequestBody = {
  id?: unknown
  address?: unknown
  price?: unknown
  status?: unknown
  headline?: unknown
  subheadline?: unknown
  cta?: unknown
  badge?: unknown
  image?: unknown
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

function parseRequestBody(raw: string | null): AddListingRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as AddListingRequestBody
  } catch {
    return null
  }
}

function requireString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function optionalString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isValidListingId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 80
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
    'Content-Type': 'application/json',
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

async function githubPutFile(params: {
  repo: string
  path: string
  branch: string
  token: string
  message: string
  content: string
  sha: string
}): Promise<string> {
  const url = `https://api.github.com/repos/${params.repo}/contents/${params.path}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: githubHeaders(params.token),
    body: JSON.stringify({
      message: params.message,
      content: Buffer.from(params.content, 'utf8').toString('base64'),
      branch: params.branch,
      sha: params.sha,
    }),
  })
  const payload = (await res.json()) as GitHubPutResponse
  if (!res.ok) {
    const message = payload.message ?? `GitHub PUT failed (${res.status})`
    throw new Error(message)
  }
  const commitSha = payload.commit?.sha ?? payload.content?.sha
  if (!commitSha) {
    throw new Error('GitHub PUT succeeded without commit sha')
  }
  return commitSha
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
    listings.push({ ...row } as WebsiteListing)
  }
  return listings
}

function rebuildListingsFile(listings: WebsiteListing[]): string {
  const arrayLiteral = JSON.stringify(listings, null, 2)
  return `${LISTINGS_FILE_HEADER}window.LISTINGS = ${arrayLiteral};\n`
}

function defaultBadgeForStatus(status: string): string {
  if (status === 'under_contract') return 'UNDER CONTRACT'
  if (status === 'sold') return 'SOLD'
  return 'FOR SALE'
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

    const body = parseRequestBody(event.body)
    const id = requireString(body?.id)
    const address = requireString(body?.address)
    const price = requireString(body?.price)
    const headline = requireString(body?.headline)
    const cta = requireString(body?.cta)
    const statusRaw = requireString(body?.status) ?? 'active'
    const subheadline = optionalString(body?.subheadline)
    const badge = optionalString(body?.badge)
    const image = optionalString(body?.image)

    if (!id || !address || !price || !headline || !cta) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing required fields: id, address, price, headline, cta',
      })
    }

    if (!isValidListingId(id)) {
      return json(400, {
        code: 'invalid_request',
        message: 'id must be lowercase URL-safe with hyphens only',
      })
    }

    if (!ALLOWED_STATUSES.has(statusRaw)) {
      return json(400, {
        code: 'invalid_request',
        message: 'status must be active, under_contract, or sold',
      })
    }

    const github = getGitHubConfig()
    if (!github) {
      safeLog('github_config_missing')
      return json(500, {
        code: 'internal_error',
        message: 'GitHub publishing is not configured',
      })
    }

    safeLog('add_started', { listing_id: id })

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

    if (listings.some((row) => row.id === id)) {
      return json(409, {
        code: 'id_exists',
        message: 'A listing with this id already exists',
      })
    }

    const newListing: WebsiteListing = {
      id,
      address,
      price,
      status: statusRaw,
      headline,
      subheadline,
      cta,
      badge: badge || defaultBadgeForStatus(statusRaw),
      image,
      ctaHref: `contact.html?listing=${id}`,
      featured: false,
      showOn: ['home'],
    }

    listings.unshift(newListing)
    const nextFile = rebuildListingsFile(listings)

    try {
      await githubPutFile({
        repo: github.repo,
        path: LISTINGS_PATH,
        branch: github.branch,
        token: github.token,
        message: `listing: add ${id}`,
        content: nextFile,
        sha: file.sha,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_put_failed', {
        message: message.slice(0, 200),
        listing_id: id,
      })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    safeLog('add_completed', { listing_id: id })
    return json(200, {
      success: true,
      listing: newListing,
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
