import { supabase } from '../lib/supabase'

export type SaveClosingInput = {
  leadId: string
  skip: boolean
  closingPrice: number | null
  notes: string | null
}

/**
 * Persist optional closing context, mark lead closed, log outcome interaction.
 */
export async function saveClosing(input: SaveClosingInput): Promise<void> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (sessionError || !token) {
    throw new Error('Please sign in again')
  }

  const res = await fetch('/api/save-closing', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lead_id: input.leadId,
      skip: input.skip,
      closing_price: input.closingPrice,
      notes: input.notes,
    }),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    message?: string
  }

  if (!res.ok) {
    throw new Error(payload.message ?? 'Could not save closing')
  }
}
