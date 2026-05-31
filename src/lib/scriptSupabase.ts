/**
 * Supabase client for Node scripts (tsx). Uses service role from .env.local.
 * Not used by the Vite browser bundle.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'

function loadEnvLocal(): void {
  const envPath = '.env.local'
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!key) continue
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

function resolveSupabaseUrl(): string | null {
  const candidates = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL]
  return candidates.find((v) => v && v.trim())?.trim() ?? null
}

/** Service-role client for local scripts; null in browser or when env is missing. */
export function getScriptSupabase(): SupabaseClient | null {
  if (typeof process === 'undefined' || !process.env) return null

  loadEnvLocal()
  const url = resolveSupabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
