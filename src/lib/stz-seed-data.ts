// src/lib/stz-seed-data.ts
//
// Jason Patti STZ profile seed data
// Source: Jason's BNI 10-minute presentation transcript
// Drafted by Zubia Mughal / Dr. Data Decision Intelligence
// Date: 2026-06-04
//
// DO NOT paraphrase, summarize, or "improve" any answer text.
// Every answer is grounded in Jason's actual words from the BNI
// transcript. Answers flagged "NEEDS JASON CONFIRMATION" are
// placeholders Jason will fill in himself when he reviews.

export interface StzSeedAnswer {
  questionId: string
  answer: string
  source: 'bni_transcript_seeded' | 'needs_confirmation'
}

export const STZ_SEED_ANSWERS: StzSeedAnswer[] = [
  // ============================================================
  // LAYER 1 — PROMPTS (How Jason Thinks)
  // ============================================================

  {
    questionId: 'q1_1',
    source: 'bni_transcript_seeded',
    answer: 'Real estate professional, 21 years in business, focused on buyer agency in the Lake Country area. Part of the Sue Patti Group, which is the team my mother Sue built over 41 years. Before real estate I did new and used auto sales, medium-duty truck sales, and retail store management. Sales is in my background long before I ever got my license.',
  },

  {
    questionId: 'q1_2',
    source: 'bni_transcript_seeded',
    answer: 'My burning desire is to be a great husband and father. Real estate gives me the schedule flexibility and earning potential to provide for Sarah, Liam (4), and Isabelle (2). Patience and hard work is what makes it work. That has been my answer since I started.',
  },

  {
    questionId: 'q1_3',
    source: 'bni_transcript_seeded',
    answer: 'I live in Hartland, moved from Delafield about three years ago. Wife Sarah, two young kids, a 7-year-old pit bull named Dolla. Hobbies are guitar, muscle cars (working on a 70s Chevelle), fishing, hiking, mountain biking, and skiing. The Lake Country lifestyle is something I actually live. My clients are searching for the life I have.',
  },

  {
    questionId: 'q1_4',
    source: 'bni_transcript_seeded',
    answer: 'I open every Realtor.com callback with "The Professional Choice in Real Estate." I describe the immediacy of working a hot lead as "ring ring." I refer to my mother\'s business as the Sue Patti Group and I lead introductions with her 41 years before I mention my 21. I say "I owe the buyer more confidentiality" when explaining why I prefer buyer agency over pre-agency.',
  },

  {
    questionId: 'q1_5',
    source: 'bni_transcript_seeded',
    answer: 'Speed and face-to-face. Realtor.com leads go to multiple agents in competitive zip codes. I drop what I am doing and call within minutes. Even when a buyer does not have pre-approval, I still schedule the showing because I want the in-person meeting to build the relationship. Patience and hard work, but the hard work starts the second the lead text arrives.',
  },

  // ============================================================
  // LAYER 2 — SKILLS (Jason's Named Workflows)
  // ============================================================

  {
    questionId: 'q2_1',
    source: 'bni_transcript_seeded',
    answer: 'One. Lead text arrives from Realtor.com. Mary is interested in 760 Milton Grove, she would like to set up a showing, please reach out, time is of the essence. Two. I drop what I am doing. Call within minutes. Three. Opening line: "Hey Mary, how you doing? This is Jason Patti with the Sue Patti Group, the Professional Choice in Real Estate, reaching out with respect to your most recent Realtor.com inquiry on [address]. It says you would like to set up a showing. What day and time works best for you?" Four. Confirm date and time. Five. Run my three qualifying questions. Six. Wrap call with "as soon as I get confirmation from the sellers, I will let you know." Seven. I show up with the showing prep package.',
  },

  {
    questionId: 'q2_2',
    source: 'bni_transcript_seeded',
    answer: 'One. "Have you spoke with the lender about financing options?" If yes, great, bring the pre-approval. If no, I still schedule the showing because I want the face-to-face. Two. If they said no on financing: "In a competitive market, it is a great idea to have a pre-approval in hand. If you do like the house and want to go after it, your offer will not carry any weight without one. Would you mind if I had TJ from Provisor reach out? Great lender, they will have the perfect mortgage product for you, and it does not cost you anything to look." Three. "Do you have a home to sell in order to buy?" If no, that makes it easier. Four. If yes: "I assume you are renting, or you are staying with your parents, whatever that is, you get that ironed out, when is your lease?" Then I set the appointment anyway because I want the face-to-face. Five. If they have a home to sell: "You need to have a CMA done to pinpoint the number on your home, and have the steps waiting in the wings to list. So if you do land on the right property, a home-sale contingency can carry weight. The seller sees you have taken the proper steps."',
  },

  {
    questionId: 'q2_3',
    source: 'bni_transcript_seeded',
    answer: 'One. The data sheet on the home. List price, taxes, tax year, acreage, bedroom count, bathroom count (full vs half), level layout, room dimensions, age of roof, age of mechanics. I read the writeup beforehand to prep for buyer questions. Two. The tax bill. To explain the difference between assessed value and list price. In one example, the assessed total was $504K, list was $764,500. I explain that lower assessment is a good thing because you pay less in taxes. I break down land value plus improvement assessment so they understand the tax math. Three. The GIS map. Buyers always ask about boundary lines and property frontage. GIS pulls from the county website, public record, accurate within a few feet but not as precise as a survey. Four. Agency disclosure forms. Pre-agency showing agreement, disclosure to customers, and buyer agents. I read the buyer pre-agency definition out loud before the showing starts.',
  },

  {
    questionId: 'q2_4',
    source: 'bni_transcript_seeded',
    answer: 'I read the buyer pre-agency definition out loud verbatim, then I tell them which option I prefer and why. "A buyer in pre-agency is not a client or a customer of the real estate firm. The firm and the agents may show properties and act as a neutral information provider, but the firm cannot negotiate for the buyer. When it comes to negotiations, drafting an offer, pre-agency authorization ends, and the firm and the buyer would establish either subagency, where the firm is a subagent of the listing firm and the buyer is a customer, or execute a buyer agency agreement where the buyer is a client. Both the buyer and the firm have a choice at this point." Then I tell them why I prefer buyer agency: "I do not prefer to work in pre-agency, because I really cannot do anything. I do not prefer to work as a customer, because that means I am working in the best interest of the seller, and half the time I do not meet the seller. I am out working with the buyer, showing them different houses, and by nature I want to work in their best interests. Buyer agency allows me to offer my full array of brokerage services. I owe the buyer more confidentiality, it takes the handcuffs off. I can even say things that negatively impact the seller, which is pretty cool."',
  },

  {
    questionId: 'q2_5',
    source: 'bni_transcript_seeded',
    answer: 'About 10% of my business is dual agency. When it happens, I have to remain neutral to both parties. I cannot choose one over the other. I become like a neutral order taker. I still have to provide brokerage services fairly and honestly, provide data upon request. It can be complicated, but financially it is the strongest position because I get paid on both sides.',
  },

  // ============================================================
  // LAYER 3 — AGENTS (Workflow Sequences & Triggers)
  // ============================================================

  {
    questionId: 'q3_1',
    source: 'bni_transcript_seeded',
    answer: 'Text from Realtor.com that says "[Name] is interested in [address], they would like to set up a showing, please reach out, time is of the essence." I am calling within minutes. In competitive zip codes like Oconomowoc, the lead goes to three or four realtors simultaneously, so whoever calls first wins. In Pewaukee I am locked out from competition because I pay more, so the urgency drops slightly there but I still move fast.',
  },

  {
    questionId: 'q3_2',
    source: 'bni_transcript_seeded',
    answer: 'Hot: Recent inquiry, specific property named, contact info complete, willing to pick up the phone, agrees to a showing within 1 week. Warm: Inquiry but slower response, talking about timeline 3 to 12 months. Cold: Old inquiry, no response after multiple attempts, vague timeline, rental-only interest. Dead: Customer rep from Realtor.com itself, non-real buyer.',
  },

  {
    questionId: 'q3_3',
    source: 'needs_confirmation',
    answer: 'NEEDS JASON CONFIRMATION. The BNI transcript does not directly address when Jason stops pursuing a lead. Working theory: he does not explicitly stop, but ranks non-responsive leads lower and works active warm ones first. Jason, please replace this text with your own answer.',
  },

  {
    questionId: 'q3_4',
    source: 'bni_transcript_seeded',
    answer: 'Rentals. I do not do rentals because there is no money in it. The commission on a $1,200/month rental at 25% referral fee is maybe $50, versus $3,000 to $5,000 on a typical home sale. If a lead wants a rental, I would refer to someone who handles them, though I do not have established relationships there yet. Commercial property I would refer that out too. Out of area: Wisconsin license, Lake Country focus. If someone is looking in another state or far outside my service area, I would refer.',
  },

  {
    questionId: 'q3_5',
    source: 'bni_transcript_seeded',
    answer: 'If cash with no contingencies, 7 days is possible, 14 days realistic. Even cash needs the title paperwork done. Standard financed deals usually run 30 to 45 days. The closing readiness signal is: financing locked, inspection passed, contingencies satisfied, title clear.',
  },

  // ============================================================
  // LAYER 4 — CONTRACTS (Human vs AI Boundaries)
  // ============================================================

  {
    questionId: 'q4_1',
    source: 'bni_transcript_seeded',
    answer: 'Pre-approval recommendations, agency relationship discussions, offer drafting, dual-agency disclosures, negotiations, anything legally binding. AI can prepare information, but the relationship-building conversation and the legal and fiduciary work has to be me face-to-face with the buyer.',
  },

  {
    questionId: 'q4_2',
    source: 'needs_confirmation',
    answer: 'NEEDS JASON CONFIRMATION. Jason has not lived with AI long enough to have an opinion. Draft based on his patterns: First-touch acknowledgement emails after a Realtor.com lead arrives. Follow-up nudges to leads who went quiet. Market update drips on archived or aged leads. Showing-confirmation logistics. Property data summaries pulled from MLS or Zillow. Not safe yet: offer language, negotiation strategy, anything with legal implications, anything about a specific seller situation. Jason, please replace this text with your own answer.',
  },

  {
    questionId: 'q4_3',
    source: 'bni_transcript_seeded',
    answer: 'Every number I quote a buyer comes from the data sheet, the tax bill, the GIS, or the MLS. I bring the source with me. I will not quote anything I cannot back up with the document in my hand. Same standard for AgentPulse: every claim about a lead history or property should be traceable to a real data source, not invented.',
  },

  {
    questionId: 'q4_4',
    source: 'bni_transcript_seeded',
    answer: 'Buyer agency obligates me to keep their information confidential from the seller side. Pre-approval status, budget ceiling, motivation level, deal-breakers. Those do not get shared. The opposite is also true. When I am in dual agency, I cannot favor one side, so I have to keep both sides confidences. AgentPulse should not surface a buyer confidential information in any output that could be seen by a seller.',
  },

  {
    questionId: 'q4_5',
    source: 'bni_transcript_seeded',
    answer: 'Wrong property data on the data sheet. Wrong assessed value. Wrong tax math. Misstating agency relationship. Drafting offer language that contradicts buyer instructions. Anything that makes me look unprepared or unprofessional in front of a buyer who is making a $400K decision. The data sheet and tax bill are credibility currency. If those are wrong, the buyer questions everything else.',
  },

  // ============================================================
  // LAYER 5 — EVALUATION (How to Measure Success)
  // ============================================================

  {
    questionId: 'q5_1',
    source: 'bni_transcript_seeded',
    answer: 'Around 25% when I track it honestly. I am really pretty good. I ran into some weird one over the weekend, but that would have put me at a 25% rate, which is really pretty good. You have to be that good or it does not pay to buy the leads.',
  },

  {
    questionId: 'q5_2',
    source: 'bni_transcript_seeded',
    answer: 'Cash with no contingencies: 7 to 14 days. Financed standard deal: 30 to 45 days. The bottleneck is title paperwork on cash, financing on the rest.',
  },

  {
    questionId: 'q5_3',
    source: 'needs_confirmation',
    answer: 'NEEDS JASON CONFIRMATION. The BNI transcript does not state average commission per deal. Jason mentioned $3,000 to $5,000 for a rental referral as 25% of a typical commission, so a typical commission is around $12,000 to $20,000. Jason, please replace this text with your own answer.',
  },

  {
    questionId: 'q5_4',
    source: 'bni_transcript_seeded',
    answer: '40 homes sold per year. $175,000 to $200,000 in revenue. (Source: Jason and Zubia 5/26 meeting.)',
  },

  {
    questionId: 'q5_5',
    source: 'needs_confirmation',
    answer: 'NEEDS JASON CONFIRMATION. The BNI transcript does not directly address how Jason will know AgentPulse is working. Draft based on his patterns: Number of never-worked leads that get worked. Number of warm leads that advance to showing. Lead-to-close ratio over time. Time saved per day on lead triage. Jason, please replace this text with your own answer.',
  },
]

// Sanity check helper: ensures every questionId from q1_1 through q5_5
// is present and unique. Run this in test scripts before seeding.
export function validateSeedAnswers(): { ok: boolean; missing: string[]; duplicates: string[] } {
  const expectedIds: string[] = []
  for (let layer = 1; layer <= 5; layer++) {
    for (let q = 1; q <= 5; q++) {
      expectedIds.push(`q${layer}_${q}`)
    }
  }
  const presentIds = STZ_SEED_ANSWERS.map(a => a.questionId)
  const missing = expectedIds.filter(id => !presentIds.includes(id))
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const id of presentIds) {
    if (seen.has(id)) duplicates.push(id)
    seen.add(id)
  }
  return { ok: missing.length === 0 && duplicates.length === 0, missing, duplicates }
}
