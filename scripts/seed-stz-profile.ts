/**
 * Update Jason's STZ profile row (service role). UPSERT: UPDATE if row exists.
 * Usage: npx tsx scripts/seed-stz-profile.ts
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import {
  STZ_SEED_ANSWERS,
  validateSeedAnswers,
} from '../src/lib/stz-seed-data'
import type { StzAnswerSource, StzQuestionId } from '../src/lib/stz-questions'
import { STZ_QUESTION_IDS } from '../src/lib/stz-questions'

const JASON_STZ_EMAIL = 'jpyourrealtor@gmail.com'

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

function buildSeedRowPayload(userEmail: string) {
  const answer_sources: Partial<Record<StzQuestionId, StzAnswerSource>> = {}
  const row: Record<string, string | Partial<Record<StzQuestionId, StzAnswerSource>>> = {
    user_email: userEmail.trim().toLowerCase(),
    answer_sources,
  }
  for (const item of STZ_SEED_ANSWERS) {
    const id = item.questionId as StzQuestionId
    row[id] = item.answer
    answer_sources[id] = item.source
  }
  return row
}

async function main() {
  const validation = validateSeedAnswers()
  if (!validation.ok) {
    throw new Error(
      `Invalid seed data: missing=${validation.missing.join(',')} duplicates=${validation.duplicates.join(',')}`,
    )
  }

  loadEnvLocal()
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env in .env.local')

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const payload = buildSeedRowPayload(JASON_STZ_EMAIL)

  const { data: existing, error: lookupError } = await admin
    .from('stz_profile')
    .select('id, user_email')
    .eq('user_email', JASON_STZ_EMAIL)
    .maybeSingle()

  if (lookupError) throw lookupError

  let data: { user_email: string; answer_sources: unknown } | null = null
  let error: { message: string } | null = null

  if (existing) {
    const result = await admin
      .from('stz_profile')
      .update(payload)
      .eq('user_email', JASON_STZ_EMAIL)
      .select('user_email, answer_sources')
      .single()
    data = result.data
    error = result.error
    console.log(`Updated existing STZ profile for ${JASON_STZ_EMAIL}`)
  } else {
    const result = await admin
      .from('stz_profile')
      .insert(payload)
      .select('user_email, answer_sources')
      .single()
    data = result.data
    error = result.error
    console.log(`Inserted new STZ profile for ${JASON_STZ_EMAIL}`)
  }

  if (error) throw error
  if (!data) throw new Error('Upsert returned no row')

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

  console.log(`Answers populated: ${populated}/${STZ_QUESTION_IDS.length}`)
  console.log('Sources:', data.answer_sources)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
