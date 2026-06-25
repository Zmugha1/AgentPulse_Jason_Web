import { supabase } from '../lib/supabase'
import { STZ_SEED_ANSWERS } from '../lib/stz-seed-data'
import type { StzAnswerSource, StzQuestionId } from '../lib/stz-questions'
import { STZ_QUESTION_IDS } from '../lib/stz-questions'
import type { StzProfile } from '../lib/types'

const PROFILE_SELECT =
  'id, user_email, q1_1, q1_2, q1_3, q1_4, q1_5, q2_1, q2_2, q2_3, q2_4, q2_5, q3_1, q3_2, q3_3, q3_4, q3_5, q4_1, q4_2, q4_3, q4_4, q4_5, q5_1, q5_2, q5_3, q5_4, q5_5, answer_sources, email_signature, created_at, updated_at'

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

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) {
    console.error(`[stzProfileService] ${context}:`, error.message)
    throw new Error(`${context}: ${error.message}`)
  }
}

function normalizeSources(
  raw: StzProfile['answer_sources'] | null | undefined,
): Partial<Record<StzQuestionId, StzAnswerSource>> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Partial<Record<StzQuestionId, StzAnswerSource>>
}

function asProfile(row: unknown): StzProfile {
  const record = row as StzProfile
  return {
    ...record,
    answer_sources: normalizeSources(record.answer_sources),
  }
}

/**
 * Load the STZ profile for the signed-in user, seeding a template row on first visit.
 */
export async function getProfileForUser(userEmail: string): Promise<StzProfile> {
  const email = userEmail.trim().toLowerCase()
  const { data, error } = await supabase
    .from('stz_profile')
    .select(PROFILE_SELECT)
    .eq('user_email', email)
    .maybeSingle()

  assertNoError(error, 'getProfileForUser')
  if (data) return asProfile(data)

  const seed = buildSeedRowPayload(email)
  const { data: inserted, error: insertError } = await supabase
    .from('stz_profile')
    .insert(seed)
    .select(PROFILE_SELECT)
    .single()

  assertNoError(insertError, 'getProfileForUser insert')
  if (!inserted) {
    throw new Error('getProfileForUser: failed to create profile')
  }
  return asProfile(inserted)
}

export function getAnswerSource(
  profile: StzProfile,
  questionId: StzQuestionId,
): StzAnswerSource | null {
  return profile.answer_sources?.[questionId] ?? null
}

export function getAnswerValue(
  profile: StzProfile,
  questionId: StzQuestionId,
): string {
  const value = profile[questionId]
  return typeof value === 'string' ? value : ''
}

/** Needs-confirmation seeds show empty until Jason saves his own answer. */
export function isAnswerPendingConfirmation(
  profile: StzProfile,
  questionId: StzQuestionId,
): boolean {
  const source = getAnswerSource(profile, questionId)
  return source === 'needs_confirmation'
}

/**
 * Update one STZ answer and mark it user_edited.
 */
export async function updateAnswer(
  userEmail: string,
  questionId: StzQuestionId,
  newAnswer: string,
): Promise<StzProfile> {
  if (!STZ_QUESTION_IDS.includes(questionId)) {
    throw new Error(`updateAnswer: invalid question id ${questionId}`)
  }

  const email = userEmail.trim().toLowerCase()
  const profile = await getProfileForUser(email)
  const trimmed = newAnswer.trim()
  const sources: Partial<Record<StzQuestionId, StzAnswerSource>> = {
    ...profile.answer_sources,
    [questionId]: 'user_edited',
  }

  const { data, error } = await supabase
    .from('stz_profile')
    .update({
      [questionId]: trimmed || null,
      answer_sources: sources,
      updated_at: new Date().toISOString(),
    })
    .eq('user_email', email)
    .select(PROFILE_SELECT)
    .single()

  assertNoError(error, 'updateAnswer')
  if (!data) {
    throw new Error('updateAnswer: no profile returned')
  }
  return asProfile(data)
}

/**
 * Batch-save STZ answers from the My AgentPulse form.
 * Only fields with non-empty trimmed content are written (empty drafts are skipped).
 */
export async function saveProfileAnswers(
  userEmail: string,
  changes: Partial<Record<StzQuestionId, string>>,
  emailSignature?: string,
): Promise<StzProfile> {
  const email = userEmail.trim().toLowerCase()
  const profile = await getProfileForUser(email)
  const sources: Partial<Record<StzQuestionId, StzAnswerSource>> = {
    ...profile.answer_sources,
  }
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  let hasUpdates = false

  for (const [questionId, rawValue] of Object.entries(changes) as [
    StzQuestionId,
    string,
  ][]) {
    if (!STZ_QUESTION_IDS.includes(questionId)) continue
    const trimmed = rawValue.trim()
    if (!trimmed) continue

    const stored = getAnswerValue(profile, questionId).trim()
    if (trimmed === stored) continue

    payload[questionId] = trimmed
    sources[questionId] = 'user_edited'
    hasUpdates = true
  }

  if (emailSignature !== undefined) {
    const trimmedSignature = emailSignature.trim()
    const storedSignature = (profile.email_signature ?? '').trim()
    if (trimmedSignature !== storedSignature) {
      payload.email_signature = trimmedSignature || null
      hasUpdates = true
    }
  }

  if (!hasUpdates) {
    return profile
  }

  payload.answer_sources = sources

  const { data, error } = await supabase
    .from('stz_profile')
    .update(payload)
    .eq('user_email', email)
    .select(PROFILE_SELECT)
    .single()

  assertNoError(error, 'saveProfileAnswers')
  if (!data) {
    throw new Error('saveProfileAnswers: no profile returned')
  }
  return asProfile(data)
}
