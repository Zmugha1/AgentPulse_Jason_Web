/**
 * Live UI verification for sidebar nav (Phase 6 Part 0).
 * Usage: npm run verify:sidebar-nav-live
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { chromium, type Page } from 'playwright'

const LIVE_URL = 'https://agentpulseweb.netlify.app'
const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? ''
const TEMP_PASSWORD = process.env.TEST_PASSWORD ?? ''

const NAV_PAGES: { label: string; expect: RegExp }[] = [
  { label: 'Morning Brief', expect: /Good (morning|afternoon|evening)/i },
  { label: 'Lead Intelligence', expect: /Showing \d+ of \d+ leads/i },
  { label: 'Market Intel', expect: /active pool/i },
  { label: 'My AgentPulse', expect: /STZ framework captures/i },
  { label: 'Integrations', expect: /Google Account/i },
]

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

async function isSidebarOffScreen(page: Page): Promise<boolean> {
  const box = await page
    .locator('[aria-label="Main navigation"]')
    .boundingBox()
  if (!box) return true
  return box.x + box.width <= 4
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
  const page = await browser.newPage()
  const failures: string[] = []

  try {
    await signInToPage(page, supabaseUrl, sessionPayload)

    const sidebar = page.locator('[aria-label="Main navigation"]')
    if (!(await sidebar.isVisible().catch(() => false))) {
      failures.push('Sidebar not visible on desktop')
    }

    if (!(await sidebar.getByRole('heading', { name: 'AgentPulse' }).isVisible().catch(() => false))) {
      failures.push('AgentPulse brand header missing in sidebar')
    }

    for (const { label } of NAV_PAGES) {
      if (!(await page.getByRole('button', { name: label }).isVisible().catch(() => false))) {
        failures.push(`Nav item missing: ${label}`)
      }
    }

    if (!(await page.getByRole('button', { name: 'Sign Out' }).isVisible().catch(() => false))) {
      failures.push('Sign Out not in sidebar')
    }

    for (const { label, expect } of NAV_PAGES) {
      await page.getByRole('button', { name: label }).click()
      await page.waitForTimeout(2000)
      if (!(await page.getByText(expect).first().isVisible().catch(() => false))) {
        failures.push(`Page content not found after nav to ${label}`)
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    if (!(await page.getByText(/Good (morning|afternoon|evening)/i).first().isVisible().catch(() => false))) {
      failures.push('Morning Brief not default after hard refresh')
    }

    await page.getByRole('button', { name: 'Lead Intelligence' }).click()
    await page.waitForTimeout(2500)

    const archiveBtn = page.getByRole('button', { name: 'Archive' }).first()
    if (!(await archiveBtn.isVisible().catch(() => false))) {
      failures.push('Archive button missing (Phase 5 Part 2 regression)')
    } else {
      await archiveBtn.click()
      await page.waitForTimeout(2000)
      if (!(await page.getByText(/Lead archived/i).isVisible().catch(() => false))) {
        failures.push('Archive toast missing after sidebar refactor')
      }
      await page.getByLabel('Show archived leads').check()
      await page.waitForTimeout(2000)
      await page.getByRole('button', { name: 'Unarchive' }).first().click()
      await page.waitForTimeout(2000)
      await page.getByLabel('Show archived leads').uncheck()
      await page.waitForTimeout(1500)
    }

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const mobilePage = await mobile.newPage()
    await signInToPage(mobilePage, supabaseUrl, sessionPayload)

    if (!(await isSidebarOffScreen(mobilePage))) {
      failures.push('Mobile: sidebar should be hidden by default')
    }

    await mobilePage.getByRole('button', { name: 'Open navigation menu' }).click()
    await mobilePage.waitForTimeout(1000)

    if (await isSidebarOffScreen(mobilePage)) {
      failures.push('Mobile: sidebar did not open from hamburger')
    }

    await mobilePage.getByRole('button', { name: 'Integrations' }).click()
    await mobilePage.waitForTimeout(2000)

    if (!(await mobilePage.getByText('Anthropic AI').isVisible().catch(() => false))) {
      failures.push('Mobile: Integrations page did not load after nav')
    }

    if (!(await isSidebarOffScreen(mobilePage))) {
      failures.push('Mobile: sidebar should close after nav item tap')
    }

    await mobilePage.getByRole('button', { name: 'Open navigation menu' }).click()
    await mobilePage.waitForTimeout(800)
    await mobilePage.mouse.click(350, 400)
    await mobilePage.waitForTimeout(800)

    if (!(await isSidebarOffScreen(mobilePage))) {
      failures.push('Mobile: backdrop tap did not close sidebar')
    }

    await mobile.close()

    if (failures.length) {
      console.error('FAILURES:\n', failures.map((f) => `- ${f}`).join('\n'))
      process.exit(1)
    }

    console.log('PASS: Sidebar nav live (desktop + mobile + archive regression).')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
