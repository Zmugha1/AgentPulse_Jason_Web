import type { Handler, HandlerEvent } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { OAuthAuthError, requireAuthenticatedUser } from './google-oauth-shared'

const LOG_MODULE = 'extract-pdf-text'
const MAX_PDF_BYTES = 5 * 1024 * 1024
const EXTRACT_MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS = 1000

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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { code: 'method_not_allowed', message: 'Method not allowed' })
  }

  try {
    await requireAuthenticatedUser(event)

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

    safeLog('extraction_complete', { text_length: text.length })
    return json(200, { text })
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
