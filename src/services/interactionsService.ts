import { supabase } from '../lib/supabase'
import { updateLeadStage } from './leadsService'

const CONTACT_OUTCOMES = new Set(['called', 'voicemail', 'emailed'])

/**
 * Morning Brief action outcome -> leads.pipeline_stage mapping.
 * called, emailed -> contacted
 * voicemail, not_interested, no_answer -> attempted
 */
const STAGE_BY_OUTCOME: Record<string, string> = {
  called: 'contacted',
  emailed: 'contacted',
  voicemail: 'attempted',
  not_interested: 'attempted',
  no_answer: 'attempted',
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) {
    console.error(`[interactionsService] ${context}:`, error.message)
    throw new Error(`${context}: ${error.message}`)
  }
}

/**
 * Set `last_contact_at` and `updated_at` on a lead after a real contact.
 */
export async function updateLastContactAt(leadId: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('leads')
    .update({
      last_contact_at: now,
      updated_at: now,
    })
    .eq('id', leadId)

  assertNoError(error, 'updateLastContactAt')
}

/**
 * Log an outbound interaction and apply lead side effects by outcome.
 * Real contacts update `last_contact_at`. `not_interested` sets stage to dead.
 */
export async function logInteraction(
  leadId: string,
  type: string,
  outcome: string,
  notes?: string | null,
): Promise<void> {
  const { error: insertError } = await supabase.from('interactions').insert({
    id: crypto.randomUUID(),
    lead_id: leadId,
    type,
    outcome,
    notes: notes ?? null,
    created_at: new Date().toISOString(),
  })

  assertNoError(insertError, 'logInteraction')

  if (CONTACT_OUTCOMES.has(outcome)) {
    await updateLastContactAt(leadId)
  }

  const stage = STAGE_BY_OUTCOME[outcome]
  if (stage) {
    await updateLeadStage(leadId, stage)
  }
}
