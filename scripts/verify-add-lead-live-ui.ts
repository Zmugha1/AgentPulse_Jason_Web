/**
 * Live UI verification for manual add-lead (Phase 5 Part 3).
 * Requires .env.local + Playwright chromium.
 *
 * Usage: npm run verify:add-lead-live
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { chromium, type Page } from 'playwright'

const LIVE_URL = 'https://agentpulseweb.netlify.app'
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? 'zubiamL4L@gmail.com'
const TEMP_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'AgentPulse-Verify-2026!'
const TEST_LEAD_EMAIL = 'demo.walkin@test.agentpulse.local'

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

async function signInToPage(
  page: Page,
  supabaseUrl: string,
  sessionPayload: object,
): Promise<void> {
  const key = storageKey(supabaseUrl)
  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(
    ({ storageKey, session }) => {
      localStorage.setItem(storageKey, JSON.stringify(session))
    },
    { storageKey: key, session: sessionPayload },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
}

async function openLeadIntelligence(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lead Intelligence' }).click()
  await page.waitForTimeout(2000)
}

async function main() {
  loadEnvLocal()
  const supabaseUrl = requireEnv('VITE_SUPABASE_URL')
  const anonKey = requireEnv('VITE_SUPABASE_ANON_KEY')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await admin.from('leads').delete().eq('email', TEST_LEAD_EMAIL)

  const { count: baselineTotal } = await admin
    .from('leads')
    .select('*', { count: 'exact', head: true })

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

  try {
    await signInToPage(page, supabaseUrl, sessionPayload)
    await openLeadIntelligence(page)

    if (
      !(await page.getByRole('button', { name: '+ Add Lead' }).isVisible().catch(() => false))
    ) {
      failures.push('+ Add Lead button not visible on Lead Intelligence')
    }

    await page.getByRole('button', { name: '+ Add Lead' }).click()
    await page.waitForTimeout(1000)

    if (!(await page.getByRole('dialog').isVisible().catch(() => false))) {
      failures.push('Add Lead modal did not open')
    }

    const saveBtn = page.getByRole('button', { name: 'Save lead' })
    if (!(await saveBtn.isDisabled())) {
      failures.push('Save should be disabled with empty required fields')
    }

    await page.locator('#add-first-name').fill('Demo')
    if (!(await saveBtn.isDisabled())) {
      failures.push('Save should stay disabled without last name')
    }

    await page.locator('#add-last-name').fill('Walkin')
    await page.locator('#add-phone').fill('262-555-0123')
    await page.locator('#add-email').fill(TEST_LEAD_EMAIL)
    await page.locator('#add-purpose').fill(
      'Live UI verification of Phase 5 Part 3',
    )
    await page.locator('#add-budget').fill('350000')

    if (await saveBtn.isDisabled()) {
      failures.push('Save should be enabled with required fields filled')
    }

    await saveBtn.click()
    await page.waitForTimeout(3000)

    if (await page.getByRole('dialog').isVisible().catch(() => false)) {
      failures.push('Modal did not close after save')
    }

    if (!(await page.getByText('Lead added').isVisible().catch(() => false))) {
      failures.push('Lead added toast not shown')
    }

    await page.locator('#lead-search').fill('Demo Walkin')
    await page.waitForTimeout(2000)

    if (!(await page.getByText('Demo Walkin').first().isVisible().catch(() => false))) {
      failures.push('New lead not visible in table after save')
    }

    const { data: dbLead, error: dbError } = await admin
      .from('leads')
      .select('source, score, purpose, pipeline_stage, is_archived')
      .eq('email', TEST_LEAD_EMAIL)
      .maybeSingle()
    if (dbError || !dbLead) {
      failures.push('Lead not found in Supabase after UI save')
    } else {
      if (dbLead.source !== 'manual') failures.push('source should be manual')
      if (dbLead.score === null) failures.push('score should be computed')
      if (!dbLead.purpose?.includes('Phase 5 Part 3')) {
        failures.push('purpose not persisted')
      }
      if (dbLead.pipeline_stage !== 'new') {
        failures.push('pipeline_stage should be new')
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await openLeadIntelligence(page)
    await page.locator('#lead-search').fill('Demo Walkin')
    await page.waitForTimeout(2000)

    if (!(await page.getByText('Demo Walkin').first().isVisible().catch(() => false))) {
      failures.push('Lead not visible after hard refresh (persistence failed)')
    }

    const archiveBtn = page.getByRole('button', { name: 'Archive' }).first()
    if (!(await archiveBtn.isVisible().catch(() => false))) {
      failures.push('Archive button not visible on new lead (regression)')
    } else {
      await archiveBtn.click()
      await page.waitForTimeout(2000)
      if (!(await page.getByText(/Lead archived/i).isVisible().catch(() => false))) {
        failures.push('Archive toast failed on new lead')
      }
    }

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const mobilePage = await mobile.newPage()
    await signInToPage(mobilePage, supabaseUrl, sessionPayload)
    await openLeadIntelligence(mobilePage)
    await mobilePage.getByRole('button', { name: '+ Add Lead' }).click()
    await mobilePage.waitForTimeout(1000)
    if (!(await mobilePage.getByRole('dialog').isVisible().catch(() => false))) {
      failures.push('Mobile: Add Lead modal did not open')
    }
    if (!(await mobilePage.locator('#add-first-name').isVisible().catch(() => false))) {
      failures.push('Mobile: first name field not visible')
    }
    if (!(await mobilePage.getByRole('button', { name: 'Cancel' }).isVisible().catch(() => false))) {
      failures.push('Mobile: Cancel button not reachable')
    }
    await mobilePage.getByRole('button', { name: 'Cancel' }).click()
    await mobile.close()

    const { error: delError } = await admin
      .from('leads')
      .delete()
      .eq('email', TEST_LEAD_EMAIL)
    if (delError) failures.push(`Cleanup delete failed: ${delError.message}`)

    const { count: afterCount } = await admin
      .from('leads')
      .select('*', { count: 'exact', head: true })
    if (afterCount !== baselineTotal) {
      failures.push(
        `Lead count after cleanup: expected ${baselineTotal}, got ${afterCount}`,
      )
    }

    if (failures.length) {
      console.error('FAILURES:\n', failures.map((f) => `- ${f}`).join('\n'))
      process.exit(1)
    }

    console.log('PASS: Live add-lead UI verified (desktop + mobile + persistence + archive regression).')
  } finally {
    await admin.from('leads').delete().eq('email', TEST_LEAD_EMAIL)
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
