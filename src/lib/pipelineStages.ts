export type PipelineStageOption = {
  value: string
  label: string
}

export const PIPELINE_STAGES: PipelineStageOption[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: "They've Responded" },
  { value: 'attempted', label: "I've Attempted Contact" },
  { value: 'nurture', label: 'Unresponsive' },
  { value: 'appointment', label: 'Appointment Set' },
  { value: 'showing', label: "We've Connected" },
  { value: 'offer', label: "We're Under Contract" },
  { value: 'closed', label: 'We Closed' },
  { value: 'dead', label: 'Inactive' },
]

const STAGE_LABEL_BY_VALUE = new Map(
  PIPELINE_STAGES.map((stage) => [stage.value, stage.label]),
)

export function getStageLabel(value: string): string {
  const normalized = value.trim().toLowerCase()
  return STAGE_LABEL_BY_VALUE.get(normalized) ?? value
}

export const PIPELINE_STAGE_VALUES = PIPELINE_STAGES.map((stage) => stage.value)
