/**
 * Isolated addLead() test via authenticated RLS insert path.
 * Usage: npx tsx scripts/test-add-lead.ts
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { setSupabaseClient } from '../src/lib/getSupabaseClient'

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? ''
const TEMP_PASSWORD = process.env.TEST_PASSWORD ?? ''

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
    throw new Error('Missing Supabase env vars in .env.local')
  }

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
  const { addLead } = await import('../src/services/leadsService')

  const lead = await addLead({
    first_name: 'Script',
    last_name: 'TestLead',
    phone: '262-555-0199',
    email: 'script.testlead@test.agentpulse.local',
    purpose: 'addLead service isolation test',
    budget_max: 400_000,
    pipeline_stage: 'new',
  })

  console.log('Inserted:', {
    id: lead.id,
    source: lead.source,
    score: lead.score,
    status: lead.status,
    pipeline_stage: lead.pipeline_stage,
  })

  if (lead.source !== 'manual') throw new Error('expected source=manual')
  if (lead.score === null || lead.status === null) {
    throw new Error('expected computed score and status')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: delError } = await admin
    .from('leads')
    .delete()
    .eq('id', lead.id)
  if (delError) throw delError

  console.log('PASS: addLead authenticated insert + scoring + cleanup')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
