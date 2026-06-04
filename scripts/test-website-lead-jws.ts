/**
 * Local + optional live JWS webhook tests. Deletes @test.agentpulse.local rows in finally.
 * Usage:
 *   npx tsx scripts/test-website-lead-jws.ts
 *   npx tsx scripts/test-website-lead-jws.ts --live
 */

import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import jwt from 'jsonwebtoken'
import path from 'path'
import type { HandlerEvent } from '@netlify/functions'
import { handler } from '../netlify/functions/website-lead'

const TEST_DOMAIN = '@test.agentpulse.local'
const LIVE_URL = 'https://agentpulseweb.netlify.app/api/website-lead'

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local missing')
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const value = t.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

/** Matches Netlify docs: iss + sha256 only (no documented iat requirement). */
function signNetlifyJws(rawBody: string, secret: string): string {
  const sha256 = createHash('sha256').update(rawBody, 'utf8').digest('hex')
  return jwt.sign({ iss: 'netlify', sha256 }, secret, { algorithm: 'HS256' })
}

function postEvent(rawBody: string, signature: string | null): HandlerEvent {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (signature) headers['X-Webhook-Signature'] = signature
  return {
    httpMethod: 'POST',
    headers,
    body: rawBody,
    isBase64Encoded: false,
    path: '/api/website-lead',
    rawUrl: '',
    rawQuery: '',
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    bodyEncoding: 'text',
  } as HandlerEvent
}

async function main(): Promise<void> {
  loadEnvLocal()
  const secret = process.env.WEBHOOK_SECRET?.trim()
  if (!secret) throw new Error('WEBHOOK_SECRET missing')

  const live = process.argv.includes('--live')
  const url = process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Missing Supabase env')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const insertedIds: string[] = []
  const results: { name: string; pass: boolean; detail: string }[] = []

  async function cleanup(): Promise<void> {
    for (const id of [...new Set(insertedIds)]) {
      await supabase.from('leads').delete().eq('id', id)
    }
    await supabase.from('leads').delete().like('email', `%${TEST_DOMAIN}`)
  }

  async function invoke(
    label: string,
    bodyObj: Record<string, unknown>,
    signature: string | null,
  ): Promise<{ status: number; body: string }> {
    const rawBody = JSON.stringify(bodyObj)
    if (live) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (signature) headers['X-Webhook-Signature'] = signature
      const res = await fetch(LIVE_URL, { method: 'POST', headers, body: rawBody })
      return { status: res.status, body: await res.text() }
    }
    const res = await handler(postEvent(rawBody, signature), {} as never)
    return { status: res.statusCode, body: res.body ?? '' }
  }

  try {
    const cases = [
      {
        name: 'chatbot valid POST',
        body: {
          form_name: 'chatbot-lead',
          created_at: new Date().toISOString(),
          data: {
            name: 'JWS Test Chatbot',
            email: `jws.chatbot${TEST_DOMAIN}`,
            phone: '262-555-0101',
            timestamp: new Date().toISOString(),
            budget: '450000',
          },
        },
        check: async (id: string) => {
          const { data } = await supabase
            .from('leads')
            .select('source, score, status')
            .eq('id', id)
            .single()
          return (
            data?.source === 'website_chatbot' &&
            data.score !== null &&
            data.score > 0
          )
        },
      },
      {
        name: 'valuation valid POST',
        body: {
          form_name: 'seller-valuation',
          created_at: new Date().toISOString(),
          data: {
            name: 'JWS Test Seller',
            email: `jws.valuation${TEST_DOMAIN}`,
            phone: '262-555-0102',
            property_address: '123 JWS Test Ln',
            zip: '53066',
          },
        },
        check: async (id: string) => {
          const { data } = await supabase
            .from('leads')
            .select('source, has_home_to_sell')
            .eq('id', id)
            .single()
          return (
            data?.source === 'website_valuation' &&
            data.has_home_to_sell === true
          )
        },
      },
      {
        name: 'newsletter valid POST',
        body: {
          form_name: 'newsletter-signup',
          created_at: new Date().toISOString(),
          data: { email: `jws.newsletter${TEST_DOMAIN}` },
        },
        check: async (id: string) => {
          const { data } = await supabase
            .from('leads')
            .select('source, pipeline_stage')
            .eq('id', id)
            .single()
          return (
            data?.source === 'website_newsletter' &&
            data.pipeline_stage === 'new'
          )
        },
      },
    ]

    for (const c of cases) {
      const rawBody = JSON.stringify(c.body)
      const sig = signNetlifyJws(rawBody, secret)
      const res = await invoke(c.name, c.body, sig)
      const parsed = JSON.parse(res.body || '{}')
      const ok = res.status === 200 && parsed.ok && parsed.id
      if (ok) insertedIds.push(parsed.id)
      const verified = ok ? await c.check(parsed.id) : false
      results.push({
        name: c.name,
        pass: ok && verified,
        detail: `status=${res.status}${ok ? ` id=${parsed.id}` : ` body=${res.body}`}`,
      })
    }

    const noSig = await invoke(
      'missing signature',
      { form_name: 'newsletter-signup', data: { email: `x${TEST_DOMAIN}` } },
      null,
    )
    results.push({
      name: 'missing X-Webhook-Signature',
      pass: noSig.status === 401,
      detail: `status=${noSig.status}`,
    })

    const wrongBody = {
      form_name: 'newsletter-signup',
      data: { email: `wrong${TEST_DOMAIN}` },
    }
    const wrongRaw = JSON.stringify(wrongBody)
    const wrongSig = signNetlifyJws(wrongRaw, 'not-the-real-secret')
    const wrong = await invoke('wrong JWS secret', wrongBody, wrongSig)
    results.push({
      name: 'wrong JWS secret',
      pass: wrong.status === 401,
      detail: `status=${wrong.status}`,
    })

    const retryBody = JSON.stringify({
      form_name: 'newsletter-signup',
      data: { email: `retry${TEST_DOMAIN}` },
    })
    const retrySig = jwt.sign(
      {
        iss: 'netlify',
        sha256: createHash('sha256').update(retryBody, 'utf8').digest('hex'),
        iat: Math.floor(Date.now() / 1000) - 600,
      },
      secret,
      { algorithm: 'HS256', noTimestamp: true },
    )
    const retry = await invoke(
      'Netlify retry JWT (old iat, valid iss+sha256)',
      JSON.parse(retryBody),
      retrySig,
    )
    const retryParsed = JSON.parse(retry.body || '{}')
    if (retry.status === 200 && retryParsed.id) {
      insertedIds.push(retryParsed.id)
    }
    results.push({
      name: 'Netlify retry JWT (old iat)',
      pass: retry.status === 200,
      detail: `status=${retry.status}`,
    })

    const badBody = 'not-json{{{'
    const badSig = signNetlifyJws(badBody, secret)
    let badStatus: number
    if (live) {
      const res = await fetch(LIVE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': badSig,
        },
        body: badBody,
      })
      badStatus = res.status
    } else {
      const res = await handler(postEvent(badBody, badSig), {} as never)
      badStatus = res.statusCode
    }
    results.push({
      name: 'malformed payload',
      pass: badStatus === 500,
      detail: `status=${badStatus}`,
    })
  } finally {
    await cleanup()
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .like('email', `%${TEST_DOMAIN}`)
    results.push({
      name: 'cleanup',
      pass: (count ?? 0) === 0,
      detail: `remaining=${count ?? 0}`,
    })
  }

  const mode = live ? 'LIVE' : 'LOCAL'
  console.log(`\n--- JWS tests (${mode}) ---\n`)
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`)
    console.log(`       ${r.detail}\n`)
  }
  if (results.some((r) => !r.pass)) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
