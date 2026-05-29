import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  return (
    <div className="min-h-screen bg-cream font-body text-navy flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-mint rounded-lg shadow-sm p-8">
        {userEmail ? (
          <div className="text-center space-y-4">
            <h1 className="font-heading text-2xl text-navy">
              Logged in as {userEmail}
            </h1>
            <p className="font-body text-navy">
              Foundation ready. Phase 0 complete.
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="font-body text-teal border-2 border-teal rounded px-4 py-2 hover:bg-cream transition-colors"
            >
              Sign Out
            </button>
            {error && (
              <p className="font-body text-coral text-sm" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

export default App
