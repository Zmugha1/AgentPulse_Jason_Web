import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let overrideClient: SupabaseClient | null = null
let browserClient: SupabaseClient | null = null

/** For Node test scripts only (service role). */
export function setSupabaseClient(client: SupabaseClient): void {
  overrideClient = client
}

/**
 * Supabase client for services. Browser uses Vite env; scripts set override first.
 */
export function getSupabaseClient(): SupabaseClient {
  if (overrideClient) return overrideClient

  if (!browserClient) {
    const url = import.meta.env?.VITE_SUPABASE_URL
    const key = import.meta.env?.VITE_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error(
        'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (browser env)',
      )
    }
    browserClient = createClient(url, key)
  }
  return browserClient
}
