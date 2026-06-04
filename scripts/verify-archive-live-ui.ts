/**
 * Live UI verification for lead archive (Phase 5 Part 2).
 * Requires .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: npx tsx scripts/verify-archive-live-ui.ts
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { chromium } from 'playwright'

const LIVE_URL = 'https://agentpulseweb.netlify.app'
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'zubiamL4L@gmail.com'
const TEMP_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'AgentPulse-Verify-2026!'

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local missing')
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

function storageKey(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

async function main() {
  loadEnvLocal()
  const supabaseUrl = requireEnv('VITE_SUPABASE_URL')
  const anonKey = requireEnv('VITE_SUPABASE_ANON_KEY')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userList, error: listError } =
    await admin.auth.admin.listUsers({ perPage: 200 })
  if (listError) throw listError
  const user = userList.users.find(
    (u) => u.email?.toLowerCase() === TEST_EMAIL.toLowerCase(),
  )
  if (!user) throw new Error(`Test user not found: ${TEST_EMAIL}`)

  await admin.auth.admin.updateUserById(user.id, {
    password: TEMP_PASSWORD,
  })

  // Reset Utopia so we exercise a full archive cycle in the UI
  await admin
    .from('leads')
    .update({ is_archived: false })
    .ilike('first_name', 'utopia')

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn, error: signInError } =
    await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEMP_PASSWORD,
    })
  if (signInError || !signIn.session) {
    throw new Error(`signInWithPassword failed: ${signInError?.message}`)
  }

  const sessionPayload = {
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
    expires_at: signIn.session.expires_at,
    expires_in: signIn.session.expires_in,
    token_type: signIn.session.token_type,
    user: signIn.session.user,
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const failures: string[] = []
  const key = storageKey(supabaseUrl)

  try {
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.evaluate(
      ({ storageKey, session }) => {
        localStorage.setItem(storageKey, JSON.stringify(session))
      },
      { storageKey: key, session: sessionPayload },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    if (
      await page.getByRole('heading', { name: 'Sign in' }).isVisible().catch(() => false)
    ) {
      failures.push('Still on sign-in after session injection')
    }

    await page.getByRole('button', { name: 'Lead Intelligence' }).click()
    await page.waitForTimeout(3000)

    await page.locator('#lead-search').fill('Utopia')
    await page.waitForTimeout(2000)

    const counterBefore = await page
      .getByText(/Showing \d+ of \d+ leads/)
      .first()
      .textContent()
    console.log('Counter before archive:', counterBefore)

    const archiveBtn = page.getByRole('button', { name: 'Archive' }).first()
    if (!(await archiveBtn.isVisible().catch(() => false))) {
      failures.push('Archive button not visible for Utopia')
    } else {
      await archiveBtn.click()
      await page.waitForTimeout(2500)
    }

    if (!(await page.getByText(/Lead archived/i).isVisible().catch(() => false))) {
      failures.push('Archive toast not shown')
    }

    const counterAfter = await page
      .getByText(/Showing \d+ of \d+ leads/)
      .first()
      .textContent()
    console.log('Counter after archive:', counterAfter)

    if (counterAfter && counterBefore && counterAfter === counterBefore) {
      failures.push('Counter did not change after archive')
    }
    if (counterAfter && !/archived hidden/.test(counterAfter)) {
      failures.push('Counter missing "archived hidden" after archive')
    }

    // Hard refresh — persistence check
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Lead Intelligence' }).click()
    await page.waitForTimeout(2000)
    await page.locator('#lead-search').fill('Utopia')
    await page.waitForTimeout(2000)

    if (
      await page.getByRole('button', { name: 'Archive' }).first().isVisible().catch(() => false)
    ) {
      failures.push('Utopia still shows Archive after hard refresh')
    }

    await page.getByLabel('Show archived leads').check()
    await page.waitForTimeout(2000)

    if (!(await page.getByText('Archived').first().isVisible().catch(() => false))) {
      failures.push('Archived badge not visible with toggle on')
    }

    await page.getByRole('button', { name: 'Unarchive' }).first().click()
    await page.waitForTimeout(2500)
    await page.getByLabel('Show archived leads').uncheck()
    await page.waitForTimeout(2000)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Lead Intelligence' }).click()
    await page.waitForTimeout(2000)
    await page.locator('#lead-search').fill('Utopia')
    await page.waitForTimeout(2000)

    if (
      !(await page.getByRole('button', { name: 'Archive' }).first().isVisible().catch(() => false))
    ) {
      failures.push('Utopia not visible after unarchive + hard refresh')
    }

    // Leave Utopia archived for Jason's demo
    await page.getByRole('button', { name: 'Archive' }).first().click()
    await page.waitForTimeout(2000)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Market Intel' }).click()
    await page.waitForTimeout(3000)
    const poolText = await page.getByText(/leads in your active pool/i).textContent()
    console.log('Market Intel hero:', poolText)
    if (poolText && !poolText.includes('869')) {
      failures.push(`Market Intel active pool expected 869, got: ${poolText}`)
    }

    if (failures.length) {
      console.error('FAILURES:\n', failures.map((f) => `- ${f}`).join('\n'))
      process.exit(1)
    }

    console.log('PASS: Live archive UI verified end-to-end with hard-refresh persistence.')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
