import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import StzAnswerField from '../components/StzAnswerField'
import { supabase } from '../lib/supabase'
import {
  questionsByLayer,
  STZ_LAYER_META,
  STZ_LAYER_ORDER,
  type StzLayerId,
} from '../lib/stz-questions'
import { getProfileForUser } from '../services/stzProfileService'
import type { StzProfile } from '../lib/types'

export default function MyAgentPulse() {
  const [profile, setProfile] = useState<StzProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [openLayers, setOpenLayers] = useState<Set<StzLayerId>>(
    () => new Set(['L1']),
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const email = sessionData.session?.user?.email
        if (!email) {
          throw new Error('Not signed in')
        }
        if (!cancelled) setUserEmail(email)
        const row = await getProfileForUser(email)
        if (!cancelled) setProfile(row)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load STZ profile',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleLayer(layer: StzLayerId) {
    setOpenLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }

  if (loading) {
    return (
      <div className="bg-white border border-mint rounded-lg p-8 text-center">
        <p className="font-body text-navy">Loading your STZ profile…</p>
      </div>
    )
  }

  if (error || !profile || !userEmail) {
    return (
      <div className="bg-white border border-mint rounded-lg p-6">
        <p className="font-body text-coral">{error ?? 'Profile unavailable'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-2xl md:text-3xl text-navy">
          My AgentPulse
        </h2>
        <p className="font-body text-base text-slate mt-2">
          Your intelligence profile and how AgentPulse learns your voice
        </p>
      </header>

      <article className="bg-white border border-mint rounded-lg p-5 md:p-6">
        <p className="font-body text-sm text-navy leading-relaxed">
          The STZ framework captures how you think (L1 Prompts), the named
          workflows you run (L2 Skills), when those workflows fire (L3 Agents),
          what stays human-only versus AI-assisted (L4 Contracts), and how you
          measure success (L5 Evaluation). These answers were seeded from your
          BNI presentation and are fully editable. AgentPulse stores them today;
          wiring them into scoring and drafting ships in a later phase.
        </p>
      </article>

      <div className="space-y-3">
        {STZ_LAYER_ORDER.map((layerId) => {
          const meta = STZ_LAYER_META[layerId]
          const open = openLayers.has(layerId)
          const questions = questionsByLayer(layerId)

          return (
            <section
              key={layerId}
              className="bg-white border border-mint rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleLayer(layerId)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[48px] text-left bg-cream/80 hover:bg-mint/30 transition-colors"
                aria-expanded={open}
              >
                <div>
                  <span className="font-label text-[10px] uppercase text-teal tracking-wide">
                    {layerId}
                  </span>
                  <h3 className="font-heading text-lg text-navy">
                    {meta.label}{' '}
                    <span className="font-body text-sm text-slate font-normal">
                      ({meta.title})
                    </span>
                  </h3>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-navy shrink-0 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                  aria-hidden
                />
              </button>

              {open ? (
                <div className="p-4 space-y-4 border-t border-mint">
                  {questions.map((q) => (
                    <StzAnswerField
                      key={q.id}
                      question={q}
                      profile={profile}
                      userEmail={userEmail}
                      onProfileUpdated={setProfile}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
