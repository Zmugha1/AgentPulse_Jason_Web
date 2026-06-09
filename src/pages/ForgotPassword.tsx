import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const trimmed = email.trim()
    if (!trimmed) {
      return
    }

    if (!e.currentTarget.checkValidity()) {
      setError('Could not send reset link. Try again in a moment.')
      return
    }

    setSubmitting(true)

    try {
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setSuccess(true)
    } catch {
      setError('Could not send reset link. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream font-body text-navy flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-mint rounded-lg shadow-sm p-8">
        <h1 className="font-heading text-2xl text-navy text-center mb-2">
          Reset your password
        </h1>
        <p className="font-body text-slate text-center mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {success ? (
          <p className="font-body text-slate text-sm text-center" role="status">
            If an account exists for that email, a reset link is on its way.
            Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="font-label text-sm text-navy block mb-1"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="font-body text-sm text-center mt-6">
          <a
            href="/login"
            className="text-slate hover:text-teal transition-colors"
          >
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  )
}
