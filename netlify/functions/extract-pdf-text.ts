import type { Handler, HandlerEvent } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import {
  getServiceSupabase,
  OAuthAuthError,
  requireAuthenticatedUser,
} from './google-oauth-shared'

const LOG_MODULE = 'extract-pdf-text'
const MAX_PDF_BYTES = 5 * 1024 * 1024
const EXTRACT_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1000
const STATS_MAX_OUTPUT_TOKENS = 800

const EXTRACT_PROMPT = `Extract all the key market statistics from this MLS market report. Return only the raw data as clean text, formatted like this example:

Area: Lake Country North
Report Period: June 2026

New Listings: 224 (+28.0% vs last year)
Closed Sales: 137 (+4.6%)
Median Sales Price: $620,000 (+0.7%)
Percent of List Price Received: 100.1%
Days on Market: [value]
Inventory: [value]

Year to Date:
New Listings: [value] ([change])
Closed Sales: [value] ([change])
Median Sales Price: [value] ([change])

Include all statistics present in the report. Use plain text only. No headers, no markdown, no commentary. Just the numbers and their year-over-year changes.`

const STATS_PROMPT = `Extract the key market statistics from this MLS report text and return ONLY a JSON object with these exact keys:
{
  "area": "string",
  "report_period": "string",
  "new_listings": 0,
  "new_listings_change_pct": 0,
  "closed_sales": 0,
  "closed_sales_change_pct": 0,
  "median_sales_price": 0,
  "median_sales_price_change_pct": 0,
  "pct_of_list_price": 0,
  "days_on_market": 0,
  "days_on_market_change_pct": 0,
  "inventory": null,
  "inventory_change_pct": null,
  "pending_sales": null,
  "pending_sales_change_pct": null
}
Use null for any value not found in the report. Return only valid JSON, no markdown, no preamble.`

export type MarketReportStats = {
  area: string
  report_period: string
  new_listings: number | null
  new_listings_change_pct: number | null
  closed_sales: number | null
  closed_sales_change_pct: number | null
  median_sales_price: number | null
  median_sales_price_change_pct: number | null
  pct_of_list_price: number | null
  days_on_market: number | null
  days_on_market_change_pct: number | null
  inventory: number | null
  inventory_change_pct: number | null
  pending_sales: number | null
  pending_sales_change_pct: number | null
}

const EMPTY_STATS: MarketReportStats = {
  area: '',
  report_period: '',
  new_listings: null,
  new_listings_change_pct: null,
  closed_sales: null,
  closed_sales_change_pct: null,
  median_sales_price: null,
  median_sales_price_change_pct: null,
  pct_of_list_price: null,
  days_on_market: null,
  days_on_market_change_pct: null,
  inventory: null,
  inventory_change_pct: null,
  pending_sales: null,
  pending_sales_change_pct: null,
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function getHeader(
  headers: HandlerEvent['headers'],
  name: string,
): string | undefined {
  if (!headers) return undefined
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && typeof value === 'string') {
      return value
    }
  }
  return undefined
}

function getBodyBuffer(event: HandlerEvent): Buffer {
  if (!event.body) return Buffer.alloc(0)
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64')
  }
  return Buffer.from(event.body, 'binary')
}

/**
 * Extract the file buffer for form field name="pdf" from a multipart body.
 */
function extractPdfField(body: Buffer, contentType: string): Buffer | null {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  if (!boundaryMatch) return null

  const boundary = boundaryMatch[1] || boundaryMatch[2]
  const normalized = Buffer.concat([Buffer.from('\r\n'), body])
  const delimiter = Buffer.from(`\r\n--${boundary}`)
  const headerSep = Buffer.from('\r\n\r\n')

  let cursor = 0
  while (cursor < normalized.length) {
    const delimAt = normalized.indexOf(delimiter, cursor)
    if (delimAt === -1) break

    let partStart = delimAt + delimiter.length
    // End marker: --boundary--
    if (
      normalized[partStart] === 0x2d /* - */ &&
      normalized[partStart + 1] === 0x2d /* - */
    ) {
      break
    }
    if (
      normalized[partStart] === 0x0d &&
      normalized[partStart + 1] === 0x0a
    ) {
      partStart += 2
    }

    const headersEnd = normalized.indexOf(headerSep, partStart)
    if (headersEnd === -1) break

    const headersText = normalized.slice(partStart, headersEnd).toString('utf8')
    const contentStart = headersEnd + headerSep.length
    const nextDelim = normalized.indexOf(delimiter, contentStart)
    const contentEnd = nextDelim === -1 ? normalized.length : nextDelim
    const fileBuffer = normalized.slice(contentStart, contentEnd)

    if (/name="pdf"/i.test(headersText)) {
      return fileBuffer
    }

    cursor = contentEnd
  }

  return null
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s,]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function parseStatsJson(raw: string): MarketReportStats {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return { ...EMPTY_STATS }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...EMPTY_STATS }
  }

  const obj = parsed as Record<string, unknown>
  return {
    area: asString(obj.area),
    report_period: asString(obj.report_period),
    new_listings: asNullableNumber(obj.new_listings),
    new_listings_change_pct: asNullableNumber(obj.new_listings_change_pct),
    closed_sales: asNullableNumber(obj.closed_sales),
    closed_sales_change_pct: asNullableNumber(obj.closed_sales_change_pct),
    median_sales_price: asNullableNumber(obj.median_sales_price),
    median_sales_price_change_pct: asNullableNumber(
      obj.median_sales_price_change_pct,
    ),
    pct_of_list_price: asNullableNumber(obj.pct_of_list_price),
    days_on_market: asNullableNumber(obj.days_on_market),
    days_on_market_change_pct: asNullableNumber(obj.days_on_market_change_pct),
    inventory: asNullableNumber(obj.inventory),
    inventory_change_pct: asNullableNumber(obj.inventory_change_pct),
    pending_sales: asNullableNumber(obj.pending_sales),
    pending_sales_change_pct: asNullableNumber(obj.pending_sales_change_pct),
  }
}

async function extractTextViaAnthropic(pdfBuffer: Buffer): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const pdfBase64 = pdfBuffer.toString('base64')

  const response = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: EXTRACT_PROMPT,
          },
        ],
      },
    ],
  })

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()

  return text
}

async function extractStatsViaAnthropic(
  reportText: string,
): Promise<MarketReportStats> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: STATS_MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: 'user',
        content: `${STATS_PROMPT}\n\nMLS report text:\n${reportText}`,
      },
    ],
  })

  const raw = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()

  return parseStatsJson(raw)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    const user = await requireAuthenticatedUser(event)
    const userEmail = normalizeEmail(user.email!)

    const contentType = getHeader(event.headers, 'content-type') ?? ''
    if (!/multipart\/form-data/i.test(contentType)) {
      return json(400, {
        code: 'invalid_request',
        message: 'Expected multipart/form-data',
      })
    }

    const bodyBuffer = getBodyBuffer(event)
    if (bodyBuffer.length > MAX_PDF_BYTES) {
      return json(400, {
        code: 'invalid_request',
        message: 'PDF must be 5MB or smaller',
      })
    }

    const pdfBuffer = extractPdfField(bodyBuffer, contentType)
    if (!pdfBuffer || pdfBuffer.length === 0) {
      return json(400, {
        code: 'invalid_request',
        message: 'missing pdf file',
      })
    }

    if (pdfBuffer.length > MAX_PDF_BYTES) {
      return json(400, {
        code: 'invalid_request',
        message: 'PDF must be 5MB or smaller',
      })
    }

    const magic = pdfBuffer.slice(0, 4).toString('latin1')
    if (magic !== '%PDF') {
      return json(400, {
        code: 'invalid_request',
        message: 'File does not appear to be a PDF',
      })
    }

    safeLog('extraction_started', { bytes: pdfBuffer.length })

    let text: string
    try {
      text = await extractTextViaAnthropic(pdfBuffer)
    } catch (err) {
      safeLog('extraction_failed', {
        message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to extract PDF content',
      })
    }

    if (!text) {
      return json(400, {
        code: 'invalid_request',
        message: 'No text could be extracted from this PDF',
      })
    }

    let stats: MarketReportStats
    try {
      stats = await extractStatsViaAnthropic(text)
    } catch (err) {
      safeLog('stats_extraction_failed', {
        message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to extract structured market stats',
      })
    }

    const supabase = getServiceSupabase()
    const reportArea = stats.area.trim()

    const { error: deactivateError } = await supabase
      .from('market_reports')
      .update({ is_active: false })
      .eq('user_email', userEmail)
      .eq('is_active', true)
      .eq('area', reportArea)

    if (deactivateError) {
      safeLog('deactivate_failed', {
        message: deactivateError.message.slice(0, 200),
        area: reportArea,
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to store market report',
      })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('market_reports')
      .insert({
        user_email: userEmail,
        area: reportArea,
        report_period: stats.report_period,
        extracted_stats: stats,
        raw_text: text,
        is_active: true,
      })
      .select('id')
      .single()

    if (insertError || !inserted?.id) {
      safeLog('insert_failed', {
        message: insertError?.message.slice(0, 200) ?? 'missing_id',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to store market report',
      })
    }

    safeLog('extraction_complete', {
      text_length: text.length,
      report_id: inserted.id,
      area: stats.area,
      report_period: stats.report_period,
    })

    return json(200, {
      text,
      stats,
      report_id: inserted.id,
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
