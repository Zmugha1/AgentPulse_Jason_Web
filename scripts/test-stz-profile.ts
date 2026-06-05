/**
 * Isolated stzProfileService test (authenticated RLS path).
 * Usage: npx tsx scripts/test-stz-profile.ts
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { setSupabaseClient } from '../src/lib/getSupabaseClient'
import { JASON_STZ_EMAIL } from '../src/lib/stz-seed-data'

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

async function main() {
  loadEnvLocal()
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Missing Supabase env vars')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: jasonRow } = await admin
    .from('stz_profile')
    .select('q1_1, answer_sources')
    .eq('user_email', JASON_STZ_EMAIL)
    .maybeSingle()

  if (!jasonRow?.q1_1) {
    throw new Error(`Jason seed row missing for ${JASON_STZ_EMAIL}`)
  }
  console.log('Jason seed row OK:', jasonRow.q1_1.slice(0, 60) + '...')

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn, error: signInError } =
    await anon.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEMP_PASSWORD,
    })
  if (signInError || !signIn.session) {
    throw new Error(`signIn failed: ${signInError?.message}`)
  }

  setSupabaseClient(anon)
  const { getProfileForUser, updateAnswer, getAnswerSource } =
    await import('../src/services/stzProfileService')

  await admin.from('stz_profile').delete().eq('user_email', TEST_EMAIL.toLowerCase())

  const profile = await getProfileForUser(TEST_EMAIL)
  if (!profile.q2_1) throw new Error('getProfileForUser missing seeded q2_1')

  const updated = await updateAnswer(
    TEST_EMAIL,
    'q1_1',
    profile.q1_1 + ' Test edit suffix.',
  )
  if (getAnswerSource(updated, 'q1_1') !== 'user_edited') {
    throw new Error('updateAnswer did not set user_edited')
  }

  await admin.from('stz_profile').delete().eq('user_email', TEST_EMAIL.toLowerCase())

  console.log('PASS: stzProfileService get + update via authenticated RLS')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
