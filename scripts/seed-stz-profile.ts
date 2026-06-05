/**
 * Seed Jason's STZ profile row (service role).
 * Usage: npx tsx scripts/seed-stz-profile.ts
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { buildSeedRowPayload, JASON_STZ_EMAIL } from '../src/lib/stz-seed-data'
import { STZ_QUESTION_IDS } from '../src/lib/stz-questions'

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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env in .env.local')

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await admin.from('stz_profile').delete().eq('user_email', JASON_STZ_EMAIL)

  const payload = buildSeedRowPayload(JASON_STZ_EMAIL)
  const { data, error } = await admin
    .from('stz_profile')
    .insert(payload)
    .select('user_email, answer_sources')
    .single()

  if (error) throw error
  if (!data) throw new Error('Insert returned no row')

  const { data: full } = await admin
    .from('stz_profile')
    .select(STZ_QUESTION_IDS.join(', '))
    .eq('user_email', JASON_STZ_EMAIL)
    .single()

  let populated = 0
  for (const id of STZ_QUESTION_IDS) {
    const v = (full as Record<string, string | null> | null)?.[id]
    if (v && v.trim()) populated++
  }

  console.log(`Seeded STZ profile for ${JASON_STZ_EMAIL}`)
  console.log(`Answers populated: ${populated}/${STZ_QUESTION_IDS.length}`)
  console.log('Sources:', data.answer_sources)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
