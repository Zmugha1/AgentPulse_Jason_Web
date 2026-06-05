import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Sidebar from './components/Sidebar'
import type { AppTab } from './lib/navigation'
import { supabase } from './lib/supabase'
import Integrations from './pages/Integrations'
import LeadIntelligence from './pages/LeadIntelligence'
import MarketIntel from './pages/MarketIntel'
import MorningBrief from './pages/MorningBrief'
import MyAgentPulse from './pages/MyAgentPulse'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    if (path === '/integrations') return 'integrations'
    return 'brief'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    if (path === '/integrations') {
      setActiveTab('integrations')
    }
  }, [])

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

  useEffect(() => {
    if (!sidebarOpen) {
      document.body.style.overflow = ''
      return
    }
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

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
      <div className="flex h-screen bg-cream font-body text-navy overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userEmail={userEmail}
          onSignOut={handleSignOut}
          mobileOpen={sidebarOpen}
          onMobileOpenChange={setSidebarOpen}
        />

        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          {error ? (
            <p
              className="font-body text-coral text-sm px-4 pt-3 md:pt-4 shrink-0"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <main className="flex-1 overflow-y-auto bg-cream p-4 pt-14 md:pt-4">
            <div className="max-w-[1400px] mx-auto">
              {activeTab === 'brief' && <MorningBrief />}
              {activeTab === 'intelligence' && <LeadIntelligence />}
              {activeTab === 'market' && <MarketIntel />}
              {activeTab === 'agentpulse' && <MyAgentPulse />}
              {activeTab === 'integrations' && <Integrations />}
            </div>
          </main>
        </div>
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
