import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type ListingStatus = 'active' | 'under_contract' | 'sold'

type WebsiteListing = {
  id: string
  address?: string
  price?: string
  status?: string
  headline?: string
  subheadline?: string
  cta?: string
}

type ListingDraft = {
  headline: string
  subheadline: string
  status: ListingStatus
  cta: string
}

type ListingSaveState = {
  saving: boolean
  success: string | null
  error: string | null
}

const STATUS_OPTIONS: { value: ListingStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'sold', label: 'Sold' },
]

const labelClass = 'font-label block text-xs uppercase text-slate mb-1'
const inputClass =
  'font-body w-full mt-1 rounded border border-mint bg-white px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal'
const primaryButtonClass =
  'font-body text-sm text-white bg-teal border border-teal rounded px-4 py-2 min-h-[44px] hover:bg-navy hover:border-navy transition-colors w-full sm:w-auto'

function normalizeStatus(value: string | undefined): ListingStatus {
  if (value === 'under_contract' || value === 'sold' || value === 'active') {
    return value
  }
  return 'active'
}

function statusBadgeClass(status: ListingStatus): string {
  if (status === 'under_contract') return 'bg-gold/20 text-navy border-gold'
  if (status === 'sold') return 'bg-coral/15 text-coral border-coral'
  return 'bg-teal/15 text-teal border-teal'
}

function statusBadgeLabel(status: ListingStatus): string {
  if (status === 'under_contract') return 'UNDER CONTRACT'
  if (status === 'sold') return 'SOLD'
  return 'ACTIVE'
}

function ListingSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="rounded border border-mint bg-white p-4 space-y-3 animate-pulse"
        >
          <div className="h-5 w-28 rounded bg-mint/50" />
          <div className="h-6 w-3/4 rounded bg-mint/40" />
          <div className="h-4 w-1/3 rounded bg-mint/30" />
          <div className="h-10 w-full rounded bg-mint/30" />
          <div className="h-10 w-full rounded bg-mint/30" />
        </div>
      ))}
    </div>
  )
}

export default function WebsiteManager() {
  const [listings, setListings] = useState<WebsiteListing[]>([])
  const [drafts, setDrafts] = useState<Record<string, ListingDraft>>({})
  const [saveStates, setSaveStates] = useState<Record<string, ListingSaveState>>(
    {},
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function getAccessToken(): Promise<string | null> {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (sessionError || !token) return null
    return token
  }

  async function loadListings() {
    setLoading(true)
    setLoadError(null)

    const token = await getAccessToken()
    if (!token) {
      setLoadError('Please sign in again')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/get-listings', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = (await res.json()) as {
        listings?: WebsiteListing[]
        message?: string
      }

      if (!res.ok) {
        setLoadError(payload.message ?? 'Could not load listings')
        setLoading(false)
        return
      }

      const rows = Array.isArray(payload.listings) ? payload.listings : []
      const nextDrafts: Record<string, ListingDraft> = {}
      const nextSaveStates: Record<string, ListingSaveState> = {}
      for (const listing of rows) {
        nextDrafts[listing.id] = {
          headline: listing.headline ?? '',
          subheadline: listing.subheadline ?? '',
          status: normalizeStatus(listing.status),
          cta: listing.cta ?? '',
        }
        nextSaveStates[listing.id] = {
          saving: false,
          success: null,
          error: null,
        }
      }
      setListings(rows)
      setDrafts(nextDrafts)
      setSaveStates(nextSaveStates)
      setLoading(false)
    } catch {
      setLoadError('Could not load listings')
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadListings()
  }, [])

  function updateDraft(
    listingId: string,
    field: keyof ListingDraft,
    value: string,
  ) {
    setDrafts((prev) => {
      const current = prev[listingId]
      if (!current) return prev
      return {
        ...prev,
        [listingId]: {
          ...current,
          [field]:
            field === 'status' ? normalizeStatus(value) : value,
        },
      }
    })
    setSaveStates((prev) => ({
      ...prev,
      [listingId]: {
        saving: false,
        success: null,
        error: null,
      },
    }))
  }

  async function saveListing(listingId: string) {
    const draft = drafts[listingId]
    if (!draft) return

    setSaveStates((prev) => ({
      ...prev,
      [listingId]: { saving: true, success: null, error: null },
    }))

    const token = await getAccessToken()
    if (!token) {
      setSaveStates((prev) => ({
        ...prev,
        [listingId]: {
          saving: false,
          success: null,
          error: 'Please sign in again',
        },
      }))
      return
    }

    try {
      const res = await fetch('/api/update-listing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listing_id: listingId,
          updates: {
            headline: draft.headline,
            subheadline: draft.subheadline,
            status: draft.status,
            cta: draft.cta,
          },
        }),
      })

      const payload = (await res.json()) as {
        success?: boolean
        listing?: WebsiteListing
        message?: string
      }

      if (!res.ok) {
        setSaveStates((prev) => ({
          ...prev,
          [listingId]: {
            saving: false,
            success: null,
            error: payload.message ?? 'Could not save listing',
          },
        }))
        return
      }

      if (payload.listing) {
        setListings((prev) =>
          prev.map((row) => (row.id === listingId ? payload.listing! : row)),
        )
      }

      setSaveStates((prev) => ({
        ...prev,
        [listingId]: {
          saving: false,
          success: 'Saved. Live in 2 min.',
          error: null,
        },
      }))
    } catch {
      setSaveStates((prev) => ({
        ...prev,
        [listingId]: {
          saving: false,
          success: null,
          error: 'Could not save listing',
        },
      }))
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h3 className="font-heading text-xl text-navy">Website Manager</h3>
        <p className="font-body text-sm text-slate mt-1">
          Update your listings live on thesuepattigroup.ai. Changes go live
          within 2 minutes.
        </p>
      </header>

      {loading ? <ListingSkeleton /> : null}

      {!loading && loadError ? (
        <div className="space-y-3">
          <p className="font-body text-sm text-coral" role="alert">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void loadListings()}
            className={primaryButtonClass}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !loadError && listings.length === 0 ? (
        <p className="font-body text-sm text-slate">No listings found.</p>
      ) : null}

      {!loading && !loadError
        ? listings.map((listing) => {
            const draft = drafts[listing.id]
            const saveState = saveStates[listing.id]
            if (!draft) return null
            const status = draft.status

            return (
              <div
                key={listing.id}
                className="rounded border border-mint bg-white p-4 md:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-label text-xs uppercase tracking-wide px-2 py-1 rounded border ${statusBadgeClass(status)}`}
                  >
                    {statusBadgeLabel(status)}
                  </span>
                </div>

                <div>
                  <h4 className="font-heading text-lg text-navy">
                    {listing.address ?? listing.id}
                  </h4>
                  <p className="font-body text-sm text-slate mt-1">
                    {listing.price ?? ''}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor={`listing-headline-${listing.id}`}
                    className={labelClass}
                  >
                    Headline
                  </label>
                  <input
                    id={`listing-headline-${listing.id}`}
                    type="text"
                    value={draft.headline}
                    onChange={(e) =>
                      updateDraft(listing.id, 'headline', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`listing-subheadline-${listing.id}`}
                    className={labelClass}
                  >
                    Subheadline
                  </label>
                  <input
                    id={`listing-subheadline-${listing.id}`}
                    type="text"
                    value={draft.subheadline}
                    onChange={(e) =>
                      updateDraft(listing.id, 'subheadline', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`listing-status-${listing.id}`}
                    className={labelClass}
                  >
                    Status
                  </label>
                  <select
                    id={`listing-status-${listing.id}`}
                    value={draft.status}
                    onChange={(e) =>
                      updateDraft(listing.id, 'status', e.target.value)
                    }
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`listing-cta-${listing.id}`}
                    className={labelClass}
                  >
                    CTA
                  </label>
                  <input
                    id={`listing-cta-${listing.id}`}
                    type="text"
                    value={draft.cta}
                    onChange={(e) =>
                      updateDraft(listing.id, 'cta', e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={saveState?.saving}
                    onClick={() => void saveListing(listing.id)}
                    className={primaryButtonClass}
                  >
                    {saveState?.saving ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          aria-hidden
                        />
                        Saving...
                      </span>
                    ) : (
                      'Save'
                    )}
                  </button>
                  {saveState?.success ? (
                    <p className="font-body text-sm text-teal" role="status">
                      {saveState.success}
                    </p>
                  ) : null}
                  {saveState?.error ? (
                    <p className="font-body text-sm text-coral" role="alert">
                      {saveState.error}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })
        : null}
    </div>
  )
}
