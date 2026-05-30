/**
 * One-time loader: curated 867 leads from frozen desktop SQLite to Supabase.
 *
 * Usage:
 *   npx tsx scripts/load-curated-leads.ts --dry-run
 *   npx tsx scripts/load-curated-leads.ts
 *
 * Requires in .env.local (never commit):
 *   SUPABASE_URL or VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import path from 'path'

const EXPECTED_TOTAL = 867
const BATCH_SIZE = 100
const CUTOFF_DATE = '2023-05-26'

const ADVANCED_STAGES = [
  'contacted',
  'attempted',
  'nurture',
  'appointment',
  'showing',
  'offer',
  'closed',
] as const

const EXPECTED_BY_SOURCE: Record<string, number> = {
  zillow: 834,
  realtor_com_full: 27,
  realtor_com_contacts: 6,
}

const EXPECTED_BY_STAGE: Record<string, number> = {
  contacted: 371,
  nurture: 153,
  attempted: 148,
  new: 66,
  appointment: 66,
  showing: 52,
  closed: 7,
  offer: 2,
  dead: 2,
}

const DESKTOP_DB_PATH = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'com.jasonagentpulse.desktop',
  'jason_agentpulse.db',
)

const CURATION_SQL = `
SELECT
  id,
  first_name,
  last_name,
  email,
  phone,
  address,
  zip,
  source,
  original_lead_date,
  last_contact_at,
  pipeline_stage,
  score,
  score_status,
  created_at,
  updated_at
FROM leads
WHERE
  date(original_lead_date) >= date(?)
  OR pipeline_stage IN (
    'contacted', 'attempted', 'nurture', 'appointment',
    'showing', 'offer', 'closed'
  )
`

type DesktopLeadRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  zip: string | null
  source: string | null
  original_lead_date: string | null
  last_contact_at: string | null
  pipeline_stage: string | null
  score: number | null
  score_status: string | null
  created_at: string | null
  updated_at: string | null
}

type SupabaseLeadRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  zip: string | null
  source: string | null
  original_lead_date: string | null
  last_contact_at: string | null
  pipeline_stage: string | null
  score: number | null
  status: string | null
  has_home_to_sell: null
  buying_or_renting: null
  lender_status: null
  created_at: string | null
  updated_at: string | null
}

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) {
    throw new Error('.env.local not found in project root')
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!key) continue
    const existing = process.env[key]
    if (existing === undefined || existing === '') {
      process.env[key] = value
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name} in .env.local`)
  }
  return value
}

function resolveSupabaseUrl(): string {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ]
  const url = candidates.find((v) => v && v.trim())?.trim()
  if (!url) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL in .env.local')
  }
  return url
}

function parseTimestamp(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function transformRow(row: DesktopLeadRow): SupabaseLeadRow {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    zip: row.zip,
    source: row.source,
    original_lead_date: parseTimestamp(row.original_lead_date),
    last_contact_at: parseTimestamp(row.last_contact_at),
    pipeline_stage: row.pipeline_stage,
    score: row.score,
    status: row.score_status,
    has_home_to_sell: null,
    buying_or_renting: null,
    lender_status: null,
    created_at: parseTimestamp(row.created_at),
    updated_at: parseTimestamp(row.updated_at),
  }
}

function countBy<T extends string>(
  rows: Array<Record<string, T | null>>,
  key: keyof (typeof rows)[number],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const value = String(row[key] ?? '(null)')
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function compareCounts(
  label: string,
  actual: Record<string, number>,
  expected: Record<string, number>,
): void {
  console.log(`\n${label}:`)
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  let ok = true
  for (const key of [...keys].sort()) {
    const a = actual[key] ?? 0
    const e = expected[key] ?? 0
    const match = a === e ? 'OK' : 'MISMATCH'
    if (a !== e) ok = false
    console.log(`  ${key}: ${a} (expected ${e}) ${match}`)
  }
  if (!ok) {
    throw new Error(`${label} does not match expected counts`)
  }
}

async function fetchRemoteLeadCount(
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  if (error) {
    throw new Error(
      `Supabase count failed: ${error.message || JSON.stringify(error)}`,
    )
  }
  return count ?? 0
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  loadEnvLocal()

  if (!existsSync(DESKTOP_DB_PATH)) {
    throw new Error(`Desktop database not found: ${DESKTOP_DB_PATH}`)
  }

  console.log(`Mode: ${dryRun ? 'DRY RUN (no Supabase writes)' : 'LIVE INSERT'}`)
  console.log(`Desktop DB: ${DESKTOP_DB_PATH} (read-only)`)

  const db = new Database(DESKTOP_DB_PATH, {
    readonly: true,
    fileMustExist: true,
  })

  const desktopRows = db
    .prepare(CURATION_SQL)
    .all(CUTOFF_DATE) as DesktopLeadRow[]

  console.log(`Curated rows from desktop: ${desktopRows.length}`)

  if (desktopRows.length !== EXPECTED_TOTAL) {
    throw new Error(
      `Expected ${EXPECTED_TOTAL} curated leads, got ${desktopRows.length}. Stopping.`,
    )
  }

  const transformed = desktopRows.map(transformRow)
  const sourceCounts = countBy(transformed, 'source')
  const stageCounts = countBy(transformed, 'pipeline_stage')

  compareCounts('Source split', sourceCounts, EXPECTED_BY_SOURCE)
  compareCounts('Pipeline stage breakdown', stageCounts, EXPECTED_BY_STAGE)

  console.log('\nFirst 5 transformed rows:')
  console.log(JSON.stringify(transformed.slice(0, 5), null, 2))

  if (dryRun) {
    console.log('\nDry run complete. No data written to Supabase.')
    return
  }

  const supabaseUrl = resolveSupabaseUrl()
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const existing = await fetchRemoteLeadCount(supabase)
  if (existing > 0) {
    throw new Error(
      `Supabase leads table already has ${existing} rows. Refusing to overwrite.`,
    )
  }

  let inserted = 0
  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(transformed.length / BATCH_SIZE)

    const { error } = await supabase.from('leads').insert(batch)
    if (error) {
      throw new Error(
        `Batch ${batchNum}/${totalBatches} failed (rows ${i + 1}-${i + batch.length}): ${error.message}`,
      )
    }

    inserted += batch.length
    console.log(
      `Batch ${batchNum}/${totalBatches}: inserted ${batch.length} (total ${inserted}/${EXPECTED_TOTAL})`,
    )
  }

  const remoteCount = await fetchRemoteLeadCount(supabase)
  console.log(`\nSupabase leads count: ${remoteCount}`)

  if (remoteCount !== EXPECTED_TOTAL) {
    throw new Error(
      `Expected ${EXPECTED_TOTAL} rows in Supabase, found ${remoteCount}`,
    )
  }

  console.log('\nLoad complete. All counts verified.')
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  return JSON.stringify(err, null, 2)
}

main().catch((err) => {
  console.error(formatError(err))
  process.exit(1)
})
