import type { Handler } from '@netlify/functions'
import {
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'update-listing'
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
  [key: string]: unknown
}

type ListingUpdates = {
  headline?: string
  subheadline?: string
  status?: string
  cta?: string
  price?: string
}

type UpdateListingRequestBody = {
  listing_id?: unknown
  updates?: unknown
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

function parseRequestBody(raw: string | null): UpdateListingRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as UpdateListingRequestBody
  } catch {
    return null
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

function parseUpdates(value: unknown): ListingUpdates | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const updates: ListingUpdates = {}

  if (typeof raw.headline === 'string') updates.headline = raw.headline
  if (typeof raw.subheadline === 'string') updates.subheadline = raw.subheadline
  if (typeof raw.cta === 'string') updates.cta = raw.cta
  if (typeof raw.price === 'string') updates.price = raw.price
  if (typeof raw.status === 'string') updates.status = raw.status.trim()

  if (
    updates.headline === undefined &&
    updates.subheadline === undefined &&
    updates.cta === undefined &&
    updates.price === undefined &&
    updates.status === undefined
  ) {
    return null
  }

  return updates
}

function applyUpdates(
  listing: WebsiteListing,
  updates: ListingUpdates,
): WebsiteListing {
  const next: WebsiteListing = { ...listing }
  if (updates.headline !== undefined) next.headline = updates.headline
  if (updates.subheadline !== undefined) next.subheadline = updates.subheadline
  if (updates.cta !== undefined) next.cta = updates.cta
  if (updates.price !== undefined) next.price = updates.price
  if (updates.status !== undefined) next.status = updates.status
  return next
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

    const body = parseRequestBody(event.body)
    const listingId =
      typeof body?.listing_id === 'string' ? body.listing_id.trim() : ''
    const updates = parseUpdates(body?.updates)

    if (!listingId) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing listing_id',
      })
    }
    if (!updates) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing updates',
      })
    }
    if (updates.status !== undefined && !ALLOWED_STATUSES.has(updates.status)) {
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

    safeLog('update_started', { listing_id: listingId })

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

    const index = listings.findIndex((row) => row.id === listingId)
    if (index < 0) {
      return json(404, {
        code: 'not_found',
        message: 'listing not found',
      })
    }

    const updatedListing = applyUpdates(listings[index], updates)
    listings[index] = updatedListing
    const nextFile = rebuildListingsFile(listings)

    try {
      await githubPutFile({
        repo: github.repo,
        path: LISTINGS_PATH,
        branch: github.branch,
        token: github.token,
        message: `listing: update ${listingId}`,
        content: nextFile,
        sha: file.sha,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_put_failed', {
        message: message.slice(0, 200),
        listing_id: listingId,
      })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    safeLog('update_completed', { listing_id: listingId })
    return json(200, {
      success: true,
      listing: updatedListing,
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
