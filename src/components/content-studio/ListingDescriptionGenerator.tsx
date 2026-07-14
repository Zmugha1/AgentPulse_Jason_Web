import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const PROPERTY_TYPE_OPTIONS = [
  'Single family',
  'Condo',
  'Townhouse',
  'Multi-family',
  'Land',
] as const

type GeneratorPhase = 'idle' | 'loading' | 'success' | 'error'

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'
const secondaryButtonClass =
  'font-body text-sm text-slate border border-mint rounded px-4 py-2 min-h-[44px] hover:bg-mint/30 transition-colors'

function wordCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export default function ListingDescriptionGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [bathrooms, setBathrooms] = useState('')
  const [squareFootage, setSquareFootage] = useState('')
  const [features, setFeatures] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [socialCaption, setSocialCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  async function runGenerate() {
    const trimmedAddress = address.trim()
    const trimmedFeatures = features.trim()
    const priceNumber = Number(price)
    const bedroomsNumber = Number(bedrooms)
    const bathroomsNumber = Number(bathrooms)
    const sqftTrimmed = squareFootage.trim()
    const squareFootageNumber = sqftTrimmed ? Number(sqftTrimmed) : null

    if (!trimmedAddress) {
      setError('Please enter an address')
      setPhase('error')
      return
    }
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError('Please enter a valid price')
      setPhase('error')
      return
    }
    if (!Number.isFinite(bedroomsNumber) || bedroomsNumber < 0) {
      setError('Please enter bedrooms')
      setPhase('error')
      return
    }
    if (!Number.isFinite(bathroomsNumber) || bathroomsNumber < 0) {
      setError('Please enter bathrooms')
      setPhase('error')
      return
    }
    if (
      squareFootageNumber !== null &&
      (!Number.isFinite(squareFootageNumber) || squareFootageNumber <= 0)
    ) {
      setError('Please enter a valid square footage')
      setPhase('error')
      return
    }
    if (!trimmedFeatures) {
      setError('Please enter key features')
      setPhase('error')
      return
    }
    if (!propertyType.trim()) {
      setError('Please select a property type')
      setPhase('error')
      return
    }

    setPhase('loading')
    setError(null)
    setCopyFeedback(null)

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) {
      setError('Please sign in again')
      setPhase('error')
      return
    }

    try {
      const payloadBody: Record<string, string | number> = {
        address: trimmedAddress,
        price: priceNumber,
        bedrooms: bedroomsNumber,
        bathrooms: bathroomsNumber,
        features: trimmedFeatures,
        property_type: propertyType,
      }
      if (squareFootageNumber !== null) {
        payloadBody.square_footage = squareFootageNumber
      }

      const res = await fetch('/api/generate-listing-description', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadBody),
      })

      const payload = (await res.json()) as {
        email_body?: string
        social_caption?: string
        message?: string
      }

      if (!res.ok) {
        setError(payload.message ?? 'Could not generate listing content')
        setPhase('error')
        return
      }

      setEmailBody(payload.email_body?.trim() ?? '')
      setSocialCaption(payload.social_caption?.trim() ?? '')
      setPhase('success')
    } catch {
      setError('Could not generate listing content')
      setPhase('error')
    }
  }

  async function copyText(text: string, feedback: string) {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(feedback)
      window.setTimeout(() => setCopyFeedback(null), 1500)
    } catch {
      setError('Could not copy to clipboard')
      setPhase('error')
    }
  }

  function handleGenerateAnother() {
    setPhase('idle')
    setAddress('')
    setPrice('')
    setBedrooms('')
    setBathrooms('')
    setSquareFootage('')
    setFeatures('')
    setPropertyType('')
    setEmailBody('')
    setSocialCaption('')
    setError(null)
    setCopyFeedback(null)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal" aria-hidden />
        <p className="font-body text-sm text-slate">Writing your listing content...</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4">
        <p className="font-body text-sm text-coral" role="alert">
          {error ?? 'Something went wrong'}
        </p>
        <button
          type="button"
          onClick={() => void runGenerate()}
          className={primaryButtonClass}
        >
          Retry
        </button>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div className="space-y-4">
        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="listing-email-body" className={labelClass}>
            Email to Leads
          </label>
          <textarea
            id="listing-email-body"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={8}
            className={inputClass}
          />
          <p className="font-body text-xs text-slate">
            {wordCount(emailBody)} words
          </p>
          <button
            type="button"
            onClick={() => void copyText(emailBody, 'Email body copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        <div className="rounded border border-mint bg-white p-4 space-y-3">
          <label htmlFor="listing-social-caption" className={labelClass}>
            Social Caption
          </label>
          <textarea
            id="listing-social-caption"
            value={socialCaption}
            onChange={(e) => setSocialCaption(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void copyText(socialCaption, 'Social caption copied')}
            className={secondaryButtonClass}
          >
            Copy
          </button>
        </div>

        {copyFeedback ? (
          <p className="font-body text-sm text-teal" role="status">
            {copyFeedback}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleGenerateAnother}
          className={secondaryButtonClass}
        >
          Generate Another
        </button>
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void runGenerate()
      }}
    >
      <div>
        <label htmlFor="listing-address" className={labelClass}>
          Address
        </label>
        <input
          id="listing-address"
          type="text"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="listing-price" className={labelClass}>
          Price
        </label>
        <input
          id="listing-price"
          type="number"
          required
          min={1}
          step={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="listing-bedrooms" className={labelClass}>
            Bedrooms
          </label>
          <input
            id="listing-bedrooms"
            type="number"
            required
            min={0}
            step={1}
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="listing-bathrooms" className={labelClass}>
            Bathrooms
          </label>
          <input
            id="listing-bathrooms"
            type="number"
            required
            min={0}
            step={0.5}
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="listing-sqft" className={labelClass}>
          Square footage
        </label>
        <input
          id="listing-sqft"
          type="number"
          min={1}
          step={1}
          value={squareFootage}
          onChange={(e) => setSquareFootage(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="listing-features" className={labelClass}>
          Key features
        </label>
        <textarea
          id="listing-features"
          required
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={4}
          placeholder="e.g. updated kitchen, finished basement, large backyard, close to schools, new roof"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="listing-property-type" className={labelClass}>
          Property type
        </label>
        <select
          id="listing-property-type"
          required
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a property type</option>
          {PROPERTY_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full`}>
        Generate
      </button>
    </form>
  )
}
