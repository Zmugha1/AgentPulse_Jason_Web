import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AddLeadInput, Lead } from '../lib/types'
import { addLead } from '../services/leadsService'

const PIPELINE_STAGES = [
  'new',
  'contacted',
  'attempted',
  'nurture',
  'appointment',
  'showing',
  'offer',
  'closed',
  'dead',
] as const

const PURPOSE_MAX_LENGTH = 200

const inputClass =
  'font-body w-full rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'

type FieldErrors = Partial<
  Record<
    'phone' | 'email' | 'zip' | 'purpose' | 'budget_max' | 'submit',
    string
  >
>

type AddLeadModalProps = {
  open: boolean
  onClose: () => void
  onSuccess: (lead: Lead) => void
}

function todayDateValue(): string {
  return new Date().toISOString().slice(0, 10)
}

function validatePhone(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.replace(/\D/g, '').length < 10) {
    return 'Phone must include at least 10 digits'
  }
  return null
}

function validateEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!trimmed.includes('@')) return 'Email must include @'
  return null
}

function validateZip(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.replace(/\D/g, '').length !== 5) {
    return 'Zip must be 5 digits'
  }
  return null
}

const emptyForm = () => ({
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  pipeline_stage: 'new',
  purpose: '',
  budget_max: '',
  has_home_to_sell: false,
  address: '',
  zip: '',
  original_lead_date: todayDateValue(),
})

export default function AddLeadModal({
  open,
  onClose,
  onSuccess,
}: AddLeadModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(emptyForm())
      setErrors({})
      setSaving(false)
    }
  }, [open])

  const canSave = useMemo(() => {
    return Boolean(form.first_name.trim() && form.last_name.trim())
  }, [form.first_name, form.last_name])

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'phone' || key === 'email' || key === 'zip') {
      setErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }))
    }
    if (key === 'purpose') {
      setErrors((prev) => ({ ...prev, purpose: undefined, submit: undefined }))
    }
  }

  function validateForm(): FieldErrors {
    const next: FieldErrors = {}
    const phoneErr = validatePhone(form.phone)
    const emailErr = validateEmail(form.email)
    const zipErr = validateZip(form.zip)
    if (phoneErr) next.phone = phoneErr
    if (emailErr) next.email = emailErr
    if (zipErr) next.zip = zipErr
    if (form.purpose.length > PURPOSE_MAX_LENGTH) {
      next.purpose = `Purpose must be ${PURPOSE_MAX_LENGTH} characters or fewer`
    }
    if (form.budget_max.trim()) {
      const budget = Number(form.budget_max)
      if (!Number.isFinite(budget) || budget < 0) {
        next.budget_max = 'Budget must be a positive number'
      }
    }
    return next
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validation = validateForm()
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      return
    }

    setSaving(true)
    setErrors({})

    const input: AddLeadInput = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      pipeline_stage: form.pipeline_stage,
      purpose: form.purpose.trim() || null,
      budget_max: form.budget_max.trim()
        ? Number(form.budget_max)
        : null,
      has_home_to_sell: form.has_home_to_sell,
      address: form.address.trim() || null,
      zip: form.zip.trim() || null,
      original_lead_date: form.original_lead_date,
    }

    try {
      const lead = await addLead(input)
      onSuccess(lead)
      onClose()
    } catch (err) {
      setErrors({
        submit:
          err instanceof Error ? err.message : 'Failed to add lead',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-lead-title"
    >
      <div className="w-full sm:max-w-lg max-h-[100dvh] sm:max-h-[90vh] flex flex-col bg-cream border border-mint sm:rounded-lg shadow-lg">
        <div className="bg-navy px-4 py-3 sm:rounded-t-lg shrink-0">
          <h2
            id="add-lead-title"
            className="font-heading text-xl text-white"
          >
            Add Lead
          </h2>
          <p className="font-body text-sm text-mint mt-1">
            Walk-ins, referrals, and networking contacts
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="add-first-name" className={labelClass}>
                  First name <span className="text-coral">*</span>
                </label>
                <input
                  id="add-first-name"
                  type="text"
                  required
                  value={form.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  className={inputClass}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="add-last-name" className={labelClass}>
                  Last name <span className="text-coral">*</span>
                </label>
                <input
                  id="add-last-name"
                  type="text"
                  required
                  value={form.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  className={inputClass}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="add-phone" className={labelClass}>
                  Phone
                </label>
                <input
                  id="add-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  onBlur={() =>
                    setErrors((prev) => ({
                      ...prev,
                      phone: validatePhone(form.phone) ?? undefined,
                    }))
                  }
                  className={inputClass}
                  autoComplete="tel"
                />
                {errors.phone ? (
                  <p className="font-body text-xs text-coral mt-1">
                    {errors.phone}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="add-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="add-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  onBlur={() =>
                    setErrors((prev) => ({
                      ...prev,
                      email: validateEmail(form.email) ?? undefined,
                    }))
                  }
                  className={inputClass}
                  autoComplete="email"
                />
                {errors.email ? (
                  <p className="font-body text-xs text-coral mt-1">
                    {errors.email}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="add-stage" className={labelClass}>
                Pipeline stage
              </label>
              <select
                id="add-stage"
                value={form.pipeline_stage}
                onChange={(e) => updateField('pipeline_stage', e.target.value)}
                className={inputClass}
              >
                {PIPELINE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="add-purpose" className={labelClass}>
                Purpose
              </label>
              <textarea
                id="add-purpose"
                rows={3}
                maxLength={PURPOSE_MAX_LENGTH}
                value={form.purpose}
                onChange={(e) => updateField('purpose', e.target.value)}
                className={inputClass}
                placeholder="What are they looking for?"
              />
              <p className="font-label text-[10px] text-slate mt-1">
                {form.purpose.length}/{PURPOSE_MAX_LENGTH}
              </p>
              {errors.purpose ? (
                <p className="font-body text-xs text-coral mt-1">
                  {errors.purpose}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="add-budget" className={labelClass}>
                  Budget max ($)
                </label>
                <input
                  id="add-budget"
                  type="number"
                  min={0}
                  step={1000}
                  value={form.budget_max}
                  onChange={(e) => updateField('budget_max', e.target.value)}
                  className={inputClass}
                />
                {errors.budget_max ? (
                  <p className="font-body text-xs text-coral mt-1">
                    {errors.budget_max}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="add-date" className={labelClass}>
                  Original lead date
                </label>
                <input
                  id="add-date"
                  type="date"
                  value={form.original_lead_date}
                  onChange={(e) =>
                    updateField('original_lead_date', e.target.value)
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="add-address" className={labelClass}>
                Address
              </label>
              <input
                id="add-address"
                type="text"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                className={inputClass}
                autoComplete="street-address"
              />
            </div>

            <div>
              <label htmlFor="add-zip" className={labelClass}>
                Zip
              </label>
              <input
                id="add-zip"
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={form.zip}
                onChange={(e) => updateField('zip', e.target.value)}
                onBlur={() =>
                  setErrors((prev) => ({
                    ...prev,
                    zip: validateZip(form.zip) ?? undefined,
                  }))
                }
                className={inputClass}
                autoComplete="postal-code"
              />
              {errors.zip ? (
                <p className="font-body text-xs text-coral mt-1">
                  {errors.zip}
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 font-body text-sm text-navy cursor-pointer">
              <input
                type="checkbox"
                checked={form.has_home_to_sell}
                onChange={(e) =>
                  updateField('has_home_to_sell', e.target.checked)
                }
                className="h-4 w-4 rounded border-mint text-teal focus:ring-teal"
              />
              Has home to sell
            </label>

            {errors.submit ? (
              <p className="font-body text-sm text-coral">{errors.submit}</p>
            ) : null}
          </div>

          <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 py-4 border-t border-mint bg-cream sm:rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="font-body text-slate border border-mint rounded px-4 py-3 min-h-[44px] hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave || saving}
              className="font-body text-white bg-teal border-2 border-teal rounded px-4 py-3 min-h-[44px] hover:bg-navy hover:border-navy disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
