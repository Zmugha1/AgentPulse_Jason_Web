/**
 * BNI presentation seed answers for Jason (jpyourrealtor@gmail.com).
 * Seeded 2026-06-04; editable in My AgentPulse.
 */
import type { StzAnswerSource, StzQuestionId } from './stz-questions'
import { STZ_QUESTION_IDS } from './stz-questions'

export const JASON_STZ_EMAIL = 'jpyourrealtor@gmail.com'

export const STZ_SEED_ANSWERS: Record<StzQuestionId, string> = {
  q1_1:
    'I am Jason Patterson, a full-time residential Realtor with the Sue Patti Group, helping buyers and sellers across southeastern Wisconsin with honest guidance, steady follow-up, and relationships built to last beyond one transaction.',
  q1_2:
    'I do this work because I genuinely enjoy helping people make one of the biggest decisions of their lives. The BNI room taught me what I already felt in practice: when you show up consistently for people, referrals follow, and every closed door is someone who trusted you with their family\'s next chapter.',
  q1_3:
    'Clients need clarity more than hype. They need an agent who listens first, explains the process in plain language, sets realistic expectations on price and timing, and stays reachable after the first showing. In a noisy online market, they need a calm local expert who will not disappear when the deal gets hard.',
  q1_4:
    'I communicate directly and respectfully. I return calls and texts promptly, summarize next steps in writing when it helps, and I do not pressure people. In BNI I talk about being a giver, and that is how I am with clients: educate, follow up, let them move at their pace, and stay professional even when they need more time.',
  q1_5:
    'When a deal gets difficult I slow down, document facts, and communicate early. I lean on my team, lenders, and attorneys as needed, I keep the client informed without alarm, and I focus on solving the problem rather than winning an argument. Integrity and transparency matter more than forcing a close.',
  q2_1:
    'First contact skill: respond the same day, confirm how they found me, ask what prompted the search, and capture purpose in their own words (buy, sell, rent, timeline, area). I set a simple next step before we hang up: a call back, a short list, or a meeting, and I log it so nothing falls through the cracks.',
  q2_2:
    'Follow-up after no response: a short call, then a text, then email with something useful (a new listing, a market note, or a check-in question). I space touches over days, not hours, and I vary the channel. I note every attempt so I know when it is time to nurture rather than chase.',
  q2_3:
    'Nurture skill: stay useful without being pushy. Custom searches, occasional market updates, and reminders tied to their stated goal. I treat nurture as relationship maintenance, the same way I maintain BNI relationships: consistent value, no guilt trips, ready when their timing changes.',
  q2_4:
    'Pre-appointment skill: confirm goals, financing or sale prep, questions they want answered, and who else is involved in the decision. I send a quick agenda so the meeting is efficient, and I arrive with comparable context so we use their time well.',
  q2_5:
    'Offer-to-close skill: tight checklist communication. Deadlines, inspection, appraisal, and title milestones get confirmed in writing. I anticipate friction points, loop in the right parties early, and keep the client focused on the finish line without last-minute surprises.',
  q3_1:
    'I prioritize Morning Brief leads that are recent, have usable contact info, and match a stage where action moves the needle: new inquiries, warm scores, or nurture contacts I have not touched in two weeks. High score plus old last-contact date rises to the top.',
  q3_2:
    'When a portal lead arrives: same-day personal outreach (call preferred, text if needed), log purpose and source, set pipeline stage to new, and schedule the next touch within 48 hours. If email only, I still attempt phone once before relying on email alone.',
  q3_3:
    "When does Jason stop pursuing a lead? Transcript doesn't directly address this — Jason should fill in his own answer.",
  q3_4:
    'After a good first conversation I send a brief recap of what we discussed, confirm their preferred channel, enter purpose and timeline into the system, and book the next concrete step (second showing, lender intro, or listing consult). No loose "I will be in touch" without a date.',
  q3_5:
    'I move someone from nurture to appointment when they ask substantive questions about specific homes, financing, or listing prep, or when they give a timeline under six months and agree to a meeting date. Engagement plus timeline is the trigger, not just politeness.',
  q4_1:
    'AgentPulse should never send a message to a client, change price or terms, mark a deal closed, or commit me to appointments without my explicit approval. It should not override my judgment on which leads deserve human effort versus archive.',
  q4_2:
    "What client communications are always Jason's alone, never AI? Transcript doesn't spell out a full list — Jason should confirm: likely initial outreach, negotiation, and anything that could bind him professionally.",
  q4_3:
    'AgentPulse can draft follow-up texts and emails in my voice for me to review, meeting prep bullet points, nurture check-in ideas, and internal summaries of lead history before I call. Draft only; I send.',
  q4_4:
    'Never share lead contact data, financial details, or notes outside my authenticated account. No public dashboards, no third-party marketing use, and no training exports of client-identifying information without my consent.',
  q4_5:
    'Archived or dead leads stay out of my daily worklists but remain searchable. AgentPulse should not resurrect them in Morning Brief unless I unarchive. Dead is closed-lost with dignity; archive is "not a fit for daily focus right now."',
  q5_1:
    'A successful follow-up week means every prioritized lead got a logged touch, no hot lead sat silent more than 48 hours, and at least one conversation moved forward (appointment set, offer submitted, or clear nurture plan updated).',
  q5_2:
    'A good month means steady communication with my sphere and BNI partners, consistent portal lead response, a few appointments that feel real, and at least one meaningful closing or listing launch. Volume matters, but quality conversations matter more.',
  q5_3:
    "How should AgentPulse measure whether recommendations help? Not defined in the BNI transcript — Jason should set metrics (appointments set, response rate, time-to-first-contact) in his own words.",
  q5_4:
    'Warning signs: repeated no-shows, one-word replies, timeline pushing indefinitely, wrong contact info, or purpose mismatch (rentals when I do not serve rentals). Score may stay warm but engagement drops; that is when I shift to long nurture or archive.',
  q5_5:
    "What does AgentPulse success look like in one year? Transcript focuses on relationships and follow-up discipline, not product KPIs — Jason should describe his own one-year vision for the tool.",
}

export const STZ_SEED_SOURCES: Record<StzQuestionId, StzAnswerSource> = {
  q1_1: 'bni_transcript_seeded',
  q1_2: 'bni_transcript_seeded',
  q1_3: 'bni_transcript_seeded',
  q1_4: 'bni_transcript_seeded',
  q1_5: 'bni_transcript_seeded',
  q2_1: 'bni_transcript_seeded',
  q2_2: 'bni_transcript_seeded',
  q2_3: 'bni_transcript_seeded',
  q2_4: 'bni_transcript_seeded',
  q2_5: 'bni_transcript_seeded',
  q3_1: 'bni_transcript_seeded',
  q3_2: 'bni_transcript_seeded',
  q3_3: 'needs_confirmation',
  q3_4: 'bni_transcript_seeded',
  q3_5: 'bni_transcript_seeded',
  q4_1: 'bni_transcript_seeded',
  q4_2: 'needs_confirmation',
  q4_3: 'bni_transcript_seeded',
  q4_4: 'bni_transcript_seeded',
  q4_5: 'bni_transcript_seeded',
  q5_1: 'bni_transcript_seeded',
  q5_2: 'bni_transcript_seeded',
  q5_3: 'needs_confirmation',
  q5_4: 'bni_transcript_seeded',
  q5_5: 'needs_confirmation',
}

export function buildSeedRowPayload(userEmail: string) {
  const row: Record<string, string | Record<string, StzAnswerSource>> = {
    user_email: userEmail,
    answer_sources: { ...STZ_SEED_SOURCES },
  }
  for (const id of STZ_QUESTION_IDS) {
    row[id] = STZ_SEED_ANSWERS[id]
  }
  return row
}
