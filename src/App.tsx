import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import LeadIntelligence from './pages/LeadIntelligence'
import MorningBrief from './pages/MorningBrief'

type AppTab = 'brief' | 'intelligence'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<AppTab>('brief')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setSubmitting(false)

    if (signInError) {
      setError(signInError.message)
      return
    }
  }

  async function handleSignOut() {
    setError(null)
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
    }
  }

  if (userEmail) {
    return (
      <div className="min-h-screen bg-cream font-body text-navy">
        <header className="bg-white border-b border-mint px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl text-navy">AgentPulse</h1>
          <div className="flex items-center gap-4">
            <span className="font-body text-sm text-slate">{userEmail}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="font-body text-teal border-2 border-teal rounded px-4 py-2 hover:bg-cream transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        <nav className="bg-white border-b border-mint px-4 flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('brief')}
            className={`font-body py-3 border-b-2 transition-colors ${
              activeTab === 'brief'
                ? 'border-teal text-navy font-semibold'
                : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            Morning Brief
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('intelligence')}
            className={`font-body py-3 border-b-2 transition-colors ${
              activeTab === 'intelligence'
                ? 'border-teal text-navy font-semibold'
                : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            Lead Intelligence
          </button>
        </nav>

        {error && (
          <p className="font-body text-coral text-sm px-4 pt-3" role="alert">
            {error}
          </p>
        )}

        <main className="p-4 max-w-[1400px] mx-auto">
          {activeTab === 'brief' ? <MorningBrief /> : <LeadIntelligence />}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream font-body text-navy flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-mint rounded-lg shadow-sm p-8">
        <h1 className="font-heading text-3xl text-navy text-center mb-6">
          AgentPulse
        </h1>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="font-label text-sm text-navy block mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="font-body w-full border border-mint rounded px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="font-label text-sm text-navy block mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-body w-full border border-mint rounded px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          {error && (
            <p className="font-body text-coral text-sm" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="font-body w-full bg-teal text-white rounded py-2 hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
