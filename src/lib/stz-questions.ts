/** STZ framework question definitions (Phase 6 Part 0 follow-up). Answers live in DB. */

export type StzLayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export type StzQuestionId =
  | 'q1_1'
  | 'q1_2'
  | 'q1_3'
  | 'q1_4'
  | 'q1_5'
  | 'q2_1'
  | 'q2_2'
  | 'q2_3'
  | 'q2_4'
  | 'q2_5'
  | 'q3_1'
  | 'q3_2'
  | 'q3_3'
  | 'q3_4'
  | 'q3_5'
  | 'q4_1'
  | 'q4_2'
  | 'q4_3'
  | 'q4_4'
  | 'q4_5'
  | 'q5_1'
  | 'q5_2'
  | 'q5_3'
  | 'q5_4'
  | 'q5_5'

export type StzAnswerSource =
  | 'bni_transcript_seeded'
  | 'needs_confirmation'
  | 'user_edited'

export type StzQuestion = {
  id: StzQuestionId
  layer: StzLayerId
  layerLabel: string
  layerTitle: string
  text: string
}

export const STZ_LAYER_META: Record<
  StzLayerId,
  { label: string; title: string }
> = {
  L1: { label: 'Prompts', title: 'How Jason Thinks' },
  L2: { label: 'Skills', title: 'Named Workflows' },
  L3: { label: 'Agents', title: 'Workflow Sequences and Triggers' },
  L4: { label: 'Contracts', title: 'Human vs AI Boundaries' },
  L5: { label: 'Evaluation', title: 'How to Measure Success' },
}

export const STZ_QUESTIONS: StzQuestion[] = [
  {
    id: 'q1_1',
    layer: 'L1',
    layerLabel: 'Prompts',
    layerTitle: 'How Jason Thinks',
    text: "What's your professional identity in one sentence?",
  },
  {
    id: 'q1_2',
    layer: 'L1',
    layerLabel: 'Prompts',
    layerTitle: 'How Jason Thinks',
    text: "What's your motivation? Why this work?",
  },
  {
    id: 'q1_3',
    layer: 'L1',
    layerLabel: 'Prompts',
    layerTitle: 'How Jason Thinks',
    text: 'What do you believe clients need most from an agent today?',
  },
  {
    id: 'q1_4',
    layer: 'L1',
    layerLabel: 'Prompts',
    layerTitle: 'How Jason Thinks',
    text: 'How would you describe your communication style with buyers and sellers?',
  },
  {
    id: 'q1_5',
    layer: 'L1',
    layerLabel: 'Prompts',
    layerTitle: 'How Jason Thinks',
    text: 'What principles guide you when a deal gets difficult?',
  },
  {
    id: 'q2_1',
    layer: 'L2',
    layerLabel: 'Skills',
    layerTitle: 'Named Workflows',
    text: 'What is your skill for the first contact with a new lead?',
  },
  {
    id: 'q2_2',
    layer: 'L2',
    layerLabel: 'Skills',
    layerTitle: 'Named Workflows',
    text: 'What is your skill for following up after no response?',
  },
  {
    id: 'q2_3',
    layer: 'L2',
    layerLabel: 'Skills',
    layerTitle: 'Named Workflows',
    text: 'What is your skill for nurturing a lead who is not ready to move yet?',
  },
  {
    id: 'q2_4',
    layer: 'L2',
    layerLabel: 'Skills',
    layerTitle: 'Named Workflows',
    text: 'What is your skill for preparing a client before a showing or listing appointment?',
  },
  {
    id: 'q2_5',
    layer: 'L2',
    layerLabel: 'Skills',
    layerTitle: 'Named Workflows',
    text: 'What is your skill for moving a deal from offer to close?',
  },
  {
    id: 'q3_1',
    layer: 'L3',
    layerLabel: 'Agents',
    layerTitle: 'Workflow Sequences and Triggers',
    text: 'What triggers you to prioritize a lead in your Morning Brief?',
  },
  {
    id: 'q3_2',
    layer: 'L3',
    layerLabel: 'Agents',
    layerTitle: 'Workflow Sequences and Triggers',
    text: 'What sequence do you run when a new Zillow or Realtor.com lead arrives?',
  },
  {
    id: 'q3_3',
    layer: 'L3',
    layerLabel: 'Agents',
    layerTitle: 'Workflow Sequences and Triggers',
    text: 'When do you stop pursuing a lead?',
  },
  {
    id: 'q3_4',
    layer: 'L3',
    layerLabel: 'Agents',
    layerTitle: 'Workflow Sequences and Triggers',
    text: 'What workflow do you run after a successful first conversation?',
  },
  {
    id: 'q3_5',
    layer: 'L3',
    layerLabel: 'Agents',
    layerTitle: 'Workflow Sequences and Triggers',
    text: 'What triggers you to move a lead from nurture to appointment?',
  },
  {
    id: 'q4_1',
    layer: 'L4',
    layerLabel: 'Contracts',
    layerTitle: 'Human vs AI Boundaries',
    text: 'What should AgentPulse never do without your explicit approval?',
  },
  {
    id: 'q4_2',
    layer: 'L4',
    layerLabel: 'Contracts',
    layerTitle: 'Human vs AI Boundaries',
    text: 'What client communications are always yours alone, never drafted or sent by AI?',
  },
  {
    id: 'q4_3',
    layer: 'L4',
    layerLabel: 'Contracts',
    layerTitle: 'Human vs AI Boundaries',
    text: 'What can AgentPulse draft for you to review and send in your voice?',
  },
  {
    id: 'q4_4',
    layer: 'L4',
    layerLabel: 'Contracts',
    layerTitle: 'Human vs AI Boundaries',
    text: 'What data should AgentPulse never share outside your account?',
  },
  {
    id: 'q4_5',
    layer: 'L4',
    layerLabel: 'Contracts',
    layerTitle: 'Human vs AI Boundaries',
    text: 'How do you want AgentPulse to handle leads you mark dead or archived?',
  },
  {
    id: 'q5_1',
    layer: 'L5',
    layerLabel: 'Evaluation',
    layerTitle: 'How to Measure Success',
    text: 'How do you know a week of lead follow-up was successful?',
  },
  {
    id: 'q5_2',
    layer: 'L5',
    layerLabel: 'Evaluation',
    layerTitle: 'How to Measure Success',
    text: 'What does a good month look like in your business?',
  },
  {
    id: 'q5_3',
    layer: 'L5',
    layerLabel: 'Evaluation',
    layerTitle: 'How to Measure Success',
    text: 'How should AgentPulse measure whether its recommendations are actually helping you?',
  },
  {
    id: 'q5_4',
    layer: 'L5',
    layerLabel: 'Evaluation',
    layerTitle: 'How to Measure Success',
    text: 'What early warning signs tell you a lead is going cold?',
  },
  {
    id: 'q5_5',
    layer: 'L5',
    layerLabel: 'Evaluation',
    layerTitle: 'How to Measure Success',
    text: 'What does success look like for AgentPulse in your practice one year from now?',
  },
]

export const STZ_QUESTION_IDS: StzQuestionId[] = STZ_QUESTIONS.map((q) => q.id)

export function questionsByLayer(layer: StzLayerId): StzQuestion[] {
  return STZ_QUESTIONS.filter((q) => q.layer === layer)
}

export const STZ_LAYER_ORDER: StzLayerId[] = ['L1', 'L2', 'L3', 'L4', 'L5']
