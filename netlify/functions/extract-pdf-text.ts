import type { Handler, HandlerEvent } from '@netlify/functions'
import PDFParser from 'pdf2json'
import { OAuthAuthError, requireAuthenticatedUser } from './google-oauth-shared'

const LOG_MODULE = 'extract-pdf-text'
const MAX_PDF_BYTES = 5 * 1024 * 1024

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

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1)
    parser.on('pdfParser_dataReady', (data) => {
      try {
        const text = (data.Pages ?? [])
          .flatMap((page: { Texts?: Array<{ R?: Array<{ T?: string }> }> }) =>
            (page.Texts ?? []).map((t) =>
              decodeURIComponent(t.R?.[0]?.T ?? ''),
            ),
          )
          .join(' ')
          .trim()
        resolve(text)
      } catch (err) {
        reject(err)
      }
    })
    parser.on('pdfParser_dataError', (err: { parserError?: Error } | Error) => {
      const raw =
        err && typeof err === 'object' && 'parserError' in err
          ? (err as { parserError?: unknown }).parserError ?? err
          : err
      safeLog('pdf2json_error', {
        message: String(raw).slice(0, 300),
      })
      reject(
        new Error(
          String(
            err && typeof err === 'object' && 'parserError' in err
              ? (err as { parserError?: unknown }).parserError ?? 'PDF parse error'
              : 'PDF parse error',
          ),
        ),
      )
    })
    parser.parseBuffer(buffer)
  })
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
        message: 'expected multipart/form-data with field pdf',
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

    // Basic PDF magic bytes check (%PDF)
    const magic = pdfBuffer.slice(0, 4).toString('latin1')
    if (magic !== '%PDF') {
      return json(400, {
        code: 'invalid_request',
        message: 'file does not appear to be a PDF',
      })
    }

    safeLog('extract_started', { bytes: pdfBuffer.length })

    let text: string
    try {
      text = await extractTextFromPdf(pdfBuffer)
    } catch (err) {
      safeLog('pdf_parse_error', {
        message: err instanceof Error ? err.message.slice(0, 300) : 'unknown error',
      })
      return json(500, {
        code: 'internal_error',
        message: 'Failed to extract text from PDF',
      })
    }

    if (!text) {
      return json(400, {
        code: 'invalid_request',
        message: 'No text could be extracted from this PDF',
      })
    }

    safeLog('extract_completed', { text_length: text.length })
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
