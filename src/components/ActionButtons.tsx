export type BriefAction =
  | 'called'
  | 'voicemail'
  | 'no_answer'
  | 'emailed'
  | 'not_interested'

export const BRIEF_ACTIONS: {
  key: BriefAction
  label: string
  type: string
  outcome: string
}[] = [
  { key: 'called', label: 'Called', type: 'call', outcome: 'called' },
  { key: 'voicemail', label: 'Voicemail', type: 'call', outcome: 'voicemail' },
  { key: 'no_answer', label: 'No Answer', type: 'call', outcome: 'no_answer' },
  { key: 'emailed', label: 'Log Email', type: 'email', outcome: 'emailed' },
  {
    key: 'not_interested',
    label: 'Not Interested',
    type: 'call',
    outcome: 'not_interested',
  },
]

type ActionButtonsProps = {
  disabled?: boolean
  onAction: (action: BriefAction) => void | Promise<void>
}

export default function ActionButtons({
  disabled,
  onAction,
}: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {BRIEF_ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          disabled={disabled}
          onClick={() => onAction(action.key)}
          className="font-body text-xs px-3 py-1.5 rounded border border-teal text-teal bg-white hover:bg-teal hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
