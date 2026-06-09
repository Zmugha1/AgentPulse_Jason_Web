import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type PageState = 'loading' | 'form' | 'expired' | 'redirecting'

function isRecoverySession(session: Session | null): boolean {
  if (!session) return false
  return Boolean(session.user.recovery_sent_at)
}

export default function ResetPassword() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let settled = false

    function markReady(session: Session | null) {
      if (settled) return
      if (isRecoverySession(session)) {
        settled = true
        setPageState('form')
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      markReady(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || isRecoverySession(session)) {
        markReady(session)
      }
    })

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        setPageState('expired')
      }
    }, 3000)

    return () => {
      settled = true
      window.clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (pageState !== 'redirecting') return

    const timer = window.setTimeout(() => {
      window.location.href = '/login'
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [pageState])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!password.trim() || !confirmPassword.trim()) {
      setError('Please fill in both password fields.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPageState('redirecting')
  }

  return (
    <div className="min-h-screen bg-cream font-body text-navy flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-mint rounded-lg shadow-sm p-8">
        {pageState === 'loading' ? (
          <p className="font-body text-slate text-sm text-center" role="status">
            Loading...
          </p>
        ) : null}

        {pageState === 'expired' ? (
          <div className="text-center space-y-4">
            <p className="font-body text-slate text-sm" role="alert">
              This reset link has expired or is invalid. Request a new one from
              the{' '}
              <a href="/forgot-password" className="text-teal hover:opacity-90">
                forgot password page
              </a>
              .
            </p>
            <p className="font-body text-sm">
              <a
                href="/login"
                className="text-slate hover:text-teal transition-colors"
              >
                Back to sign in
              </a>
            </p>
          </div>
        ) : null}

        {pageState === 'redirecting' ? (
          <p className="font-body text-slate text-sm text-center" role="status">
            Password updated. Redirecting...
          </p>
        ) : null}

        {pageState === 'form' ? (
          <>
            <h1 className="font-heading text-2xl text-navy text-center mb-2">
              Set a new password
            </h1>
            <p className="font-body text-slate text-center mb-6">
              Choose a password you haven&apos;t used before. At least 8
              characters.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="font-label text-sm text-navy block mb-1"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-body w-full border border-mint rounded px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>
              <div>
                <label
                  htmlFor="confirm-password"
                  className="font-label text-sm text-navy block mb-1"
                >
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="font-body w-full border border-mint rounded px-3 py-2 text-navy focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>
              {error ? (
                <p className="font-body text-coral text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="font-body w-full bg-teal text-white rounded py-2 hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {submitting ? 'Saving...' : 'Save new password'}
              </button>
            </form>
            <p className="font-body text-sm text-center mt-6">
              <a
                href="/login"
                className="text-slate hover:text-teal transition-colors"
              >
                Back to sign in
              </a>
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
