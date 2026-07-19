import type { Handler } from '@netlify/functions'
import {
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'publish-blog-post'
const SITE_ORIGIN = 'https://thesuepattigroup.ai'
const BLOG_POSTS_START = '<!-- AGENTPULSE_BLOG_POSTS_START -->'
const BLOG_POSTS_END = '<!-- AGENTPULSE_BLOG_POSTS_END -->'

type PublishBlogPostRequestBody = {
  title?: unknown
  content?: unknown
  slug?: unknown
  meta_description?: unknown
  publish_date?: unknown
}

type GitHubFileResponse = {
  sha?: string
  content?: string
  encoding?: string
  message?: string
}

type GitHubPutResponse = {
  commit?: { sha?: string }
  content?: { sha?: string; path?: string }
  message?: string
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

function parseRequestBody(raw: string | null): PublishBlogPostRequestBody | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as PublishBlogPostRequestBody
  } catch {
    return null
  }
}

function requireString(value: unknown, field: string): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDisplayDate(isoDate: string): string {
  const parsed = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  })
}

function toIsoDate(isoDate: string): string {
  const parsed = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function looksLikeHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content)
}

function contentToHtml(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  if (looksLikeHtml(trimmed)) return trimmed
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
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
): Promise<{ exists: boolean; sha?: string; content?: string; status: number }> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, { headers: githubHeaders(token) })
  if (res.status === 404) {
    return { exists: false, status: 404 }
  }
  const payload = (await res.json()) as GitHubFileResponse
  if (!res.ok) {
    const message = payload.message ?? `GitHub GET failed (${res.status})`
    throw new Error(message)
  }
  const decoded =
    payload.encoding === 'base64' && typeof payload.content === 'string'
      ? Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8')
      : payload.content
  return {
    exists: true,
    sha: payload.sha,
    content: decoded,
    status: res.status,
  }
}

async function githubPutFile(params: {
  repo: string
  path: string
  branch: string
  token: string
  message: string
  content: string
  sha?: string
}): Promise<string> {
  const url = `https://api.github.com/repos/${params.repo}/contents/${params.path}`
  const body: Record<string, string> = {
    message: params.message,
    content: Buffer.from(params.content, 'utf8').toString('base64'),
    branch: params.branch,
  }
  if (params.sha) {
    body.sha = params.sha
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: githubHeaders(params.token),
    body: JSON.stringify(body),
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

function buildSiteChrome(activeBlog = false): { topbar: string; nav: string; footer: string } {
  const blogActive = activeBlog ? ' class="active"' : ''
  return {
    topbar: `<div class="topbar">
  <div class="container">
    <span>Realty Executives Integrity Lake Country | Hartland, WI</span>
    <span>📞 (262) 901-8348 | 📧 Jason@TheSuePattiGroup.com</span>
  </div>
</div>`,
    nav: `<nav class="nav">
  <div class="container">
    <a href="/index.html" style="text-decoration:none">
      <div class="nav-logo">
        <img src="/assets/images/logo_v2.png" alt="The Sue Patti Group | Realty Executives Integrity">
      </div>
    </a>
    <ul class="nav-links">
      <li><a href="/index.html">Home</a></li>
      <li><a href="/search.html">Search</a></li>
      <li><a href="/neighborhoods.html">Neighborhoods</a></li>
      <li><a href="/sold-homes.html">Sold Homes</a></li>
      <li><a href="/reviews.html">Reviews</a></li>
      <li><a href="/home-valuation.html">Home Value</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/contact.html">Contact</a></li>
      <li><a href="/blog/index.html"${blogActive}>Blog</a></li>
    </ul>
  </div>
</nav>`,
    footer: `<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <div class="footer-brand">The Sue Patti Group<span>Discover Lake Country and Beyond</span></div>
        <p class="footer-tag">
          Realty Executives Integrity Lake Country<br>
          810 Cardinal Lane, Suite 100<br>
          Hartland, WI 53029<br>
          (262) 901-8348
        </p>
        <div class="footer-domain">thesuepattigroup.ai</div>
      </div>
      <div>
        <h4>Explore</h4>
        <a href="/index.html">Home</a>
        <a href="/search.html">Search Homes</a>
        <a href="/neighborhoods.html">Neighborhoods</a>
        <a href="/sold-homes.html">Sold Homes</a>
        <a href="/reviews.html">Reviews</a>
        <a href="/blog/index.html">Blog</a>
      </div>
      <div>
        <h4>Tools</h4>
        <a href="/home-valuation.html">Home Valuation</a>
        <a href="/contact.html">Contact</a>
        <a href="/about.html">About Us</a>
      </div>
      <div>
        <h4>Connect</h4>
        <a href="https://www.zillow.com/profile/The-Sue-Patti-Group" target="_blank" rel="noopener">Zillow Profile</a>
        <a href="https://www.realtyexecutives.com/agents/sue-patti" target="_blank" rel="noopener">Realty Executives</a>
        <a href="https://www.facebook.com/The-Sue-Patti-Group-Realty-Executives-Integrity-1442386436052839/" target="_blank" rel="noopener">Facebook</a>
        <a href="https://www.linkedin.com/in/the-sue-patti-group-b8450b87/" target="_blank" rel="noopener">LinkedIn</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; 2026 The Sue Patti Group. All rights reserved.</span>
      <span>Powered by AgentPulse | Dr. Data Decision Intelligence LLC</span>
    </div>
  </div>
</footer>`,
  }
}

function buildBlogPostHtml(params: {
  title: string
  slug: string
  metaDescription: string
  contentHtml: string
  publishDateIso: string
  publishDateDisplay: string
}): string {
  const { topbar, nav, footer } = buildSiteChrome(true)
  const pageUrl = `${SITE_ORIGIN}/blog/${params.slug}.html`
  const safeTitle = escapeHtml(params.title)
  const safeMeta = escapeHtml(params.metaDescription)
  const encodedUrl = encodeURIComponent(pageUrl)
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: params.title,
    description: params.metaDescription,
    datePublished: params.publishDateIso,
    author: {
      '@type': 'Person',
      name: 'Jason Patti',
      worksFor: {
        '@type': 'Organization',
        name: 'The Sue Patti Group',
      },
    },
    publisher: {
      '@type': 'Organization',
      name: 'The Sue Patti Group',
      url: SITE_ORIGIN,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${safeTitle} | The Sue Patti Group</title>
<meta name="description" content="${safeMeta}">
<meta name="author" content="Jason Patti, The Sue Patti Group">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="article">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeMeta}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeMeta}">
<link rel="stylesheet" href="/css/style.css">
<style>
  .blog-article {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1.25rem 3rem;
  }
  .blog-back {
    display: inline-block;
    margin-bottom: 1.5rem;
    color: #2D3E50;
    text-decoration: none;
    font-size: 0.95rem;
  }
  .blog-back:hover { text-decoration: underline; }
  .blog-article h1 {
    color: #2D3E50;
    font-size: 2rem;
    line-height: 1.25;
    margin: 0 0 0.75rem;
  }
  .blog-byline {
    color: #64748b;
    margin: 0 0 2rem;
    font-size: 0.95rem;
  }
  .blog-body {
    color: #2D3E50;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.125rem;
    line-height: 1.75;
  }
  .blog-body p { margin: 0 0 1.25rem; }
  .blog-share {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e2e8f0;
  }
  .blog-share h2 {
    color: #2D3E50;
    font-size: 1.1rem;
    margin: 0 0 0.75rem;
  }
  .blog-share-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .blog-share-links a {
    display: inline-block;
    padding: 0.6rem 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    color: #2D3E50;
    text-decoration: none;
    font-size: 0.95rem;
  }
  .blog-share-links a:hover { background: #f8fafc; }
</style>
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>
<script src="/js/analytics.js"></script>
</head>
<body>
${topbar}
${nav}
<main class="blog-article">
  <a class="blog-back" href="/blog/index.html">&larr; Back to blog</a>
  <h1>${safeTitle}</h1>
  <p class="blog-byline">By Jason Patti, The Sue Patti Group &middot; ${escapeHtml(params.publishDateDisplay)}</p>
  <div class="blog-body">
${params.contentHtml}
  </div>
  <div class="blog-share">
    <h2>Share this post</h2>
    <div class="blog-share-links">
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener">Share on Facebook</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener">Share on LinkedIn</a>
    </div>
  </div>
</main>
${footer}
</body>
</html>
`
}

function buildBlogIndexEntry(params: {
  title: string
  slug: string
  metaDescription: string
  publishDateDisplay: string
}): string {
  const safeTitle = escapeHtml(params.title)
  const safeMeta = escapeHtml(params.metaDescription)
  return `<article class="blog-index-item" data-slug="${escapeHtml(params.slug)}">
  <h2><a href="/blog/${escapeHtml(params.slug)}.html">${safeTitle}</a></h2>
  <p class="blog-index-meta">${escapeHtml(params.publishDateDisplay)}</p>
  <p>${safeMeta}</p>
  <a class="blog-index-read" href="/blog/${escapeHtml(params.slug)}.html">Read more &rarr;</a>
</article>`
}

function buildBlogIndexHtml(postsHtml: string): string {
  const { topbar, nav, footer } = buildSiteChrome(true)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Lake Country Real Estate Blog | The Sue Patti Group</title>
<meta name="description" content="Market updates, seller tips, and Lake Country Wisconsin real estate insights from Jason Patti and The Sue Patti Group.">
<link rel="canonical" href="${SITE_ORIGIN}/blog/index.html">
<link rel="stylesheet" href="/css/style.css">
<style>
  .blog-index {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1.25rem 3rem;
  }
  .blog-index h1 {
    color: #2D3E50;
    margin: 0 0 0.5rem;
  }
  .blog-index-intro {
    color: #64748b;
    margin: 0 0 2rem;
  }
  .blog-index-item {
    padding: 1.5rem 0;
    border-bottom: 1px solid #e2e8f0;
  }
  .blog-index-item h2 {
    color: #2D3E50;
    font-size: 1.35rem;
    margin: 0 0 0.4rem;
  }
  .blog-index-item h2 a {
    color: inherit;
    text-decoration: none;
  }
  .blog-index-item h2 a:hover { text-decoration: underline; }
  .blog-index-meta {
    color: #64748b;
    font-size: 0.9rem;
    margin: 0 0 0.75rem;
  }
  .blog-index-read {
    color: #2D3E50;
    font-weight: 600;
    text-decoration: none;
  }
  .blog-index-read:hover { text-decoration: underline; }
</style>
<script src="/js/analytics.js"></script>
</head>
<body>
${topbar}
${nav}
<main class="blog-index">
  <h1>Lake Country Real Estate Blog</h1>
  <p class="blog-index-intro">Market updates and local insights from Jason Patti and The Sue Patti Group.</p>
  ${BLOG_POSTS_START}
${postsHtml}
  ${BLOG_POSTS_END}
</main>
${footer}
</body>
</html>
`
}

function upsertBlogIndex(existingHtml: string | null, entryHtml: string): string {
  if (!existingHtml) {
    return buildBlogIndexHtml(entryHtml)
  }

  const start = existingHtml.indexOf(BLOG_POSTS_START)
  const end = existingHtml.indexOf(BLOG_POSTS_END)
  if (start >= 0 && end > start) {
    const before = existingHtml.slice(0, start + BLOG_POSTS_START.length)
    const after = existingHtml.slice(end)
    const current = existingHtml
      .slice(start + BLOG_POSTS_START.length, end)
      .trim()
    const next = current ? `${entryHtml}\n${current}` : entryHtml
    return `${before}\n${next}\n  ${after}`
  }

  // Existing index without markers: rebuild with new entry only
  return buildBlogIndexHtml(entryHtml)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

    const body = parseRequestBody(event.body)
    const title = requireString(body?.title, 'title')
    const content = requireString(body?.content, 'content')
    const slug = requireString(body?.slug, 'slug')
    const metaDescription = requireString(body?.meta_description, 'meta_description')
    const publishDate = requireString(body?.publish_date, 'publish_date')

    if (!title || !content || !slug || !metaDescription || !publishDate) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing required fields: title, content, slug, meta_description, publish_date',
      })
    }

    if (!isValidSlug(slug)) {
      return json(400, {
        code: 'invalid_request',
        message: 'slug must be lowercase URL-safe with hyphens only',
      })
    }

    if (metaDescription.length > 160) {
      return json(400, {
        code: 'invalid_request',
        message: 'meta_description must be 160 characters or fewer',
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

    const postPath = `blog/${slug}.html`
    const indexPath = 'blog/index.html'
    const publishDateIso = toIsoDate(publishDate)
    const publishDateDisplay = formatDisplayDate(publishDate)
    const contentHtml = contentToHtml(content)
    const postHtml = buildBlogPostHtml({
      title,
      slug,
      metaDescription,
      contentHtml,
      publishDateIso,
      publishDateDisplay,
    })
    const indexEntry = buildBlogIndexEntry({
      title,
      slug,
      metaDescription,
      publishDateDisplay,
    })

    safeLog('publish_started', { slug })

    let existingPost
    try {
      existingPost = await githubGetFile(github.repo, postPath, github.branch, github.token)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_get_post_failed', { message: message.slice(0, 200), slug })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    if (existingPost.exists) {
      return json(409, {
        code: 'slug_exists',
        message: 'A post with this slug is already published',
      })
    }

    let existingIndex
    try {
      existingIndex = await githubGetFile(github.repo, indexPath, github.branch, github.token)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_get_index_failed', { message: message.slice(0, 200) })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    const nextIndexHtml = upsertBlogIndex(existingIndex.content ?? null, indexEntry)

    let postCommitSha: string
    try {
      postCommitSha = await githubPutFile({
        repo: github.repo,
        path: postPath,
        branch: github.branch,
        token: github.token,
        message: `blog: publish ${title}`,
        content: postHtml,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_put_post_failed', { message: message.slice(0, 200), slug })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    try {
      await githubPutFile({
        repo: github.repo,
        path: indexPath,
        branch: github.branch,
        token: github.token,
        message: `blog: update index for ${title}`,
        content: nextIndexHtml,
        sha: existingIndex.sha,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      safeLog('github_put_index_failed', { message: message.slice(0, 200), slug })
      return json(500, { code: 'internal_error', message: 'GitHub API error' })
    }

    const url = `${SITE_ORIGIN}/blog/${slug}.html`
    safeLog('publish_completed', { slug, commit_sha: postCommitSha })
    return json(200, {
      success: true,
      url,
      commit_sha: postCommitSha,
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
