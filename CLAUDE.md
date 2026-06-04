# AgentPulse Jason Web — Claude / Cursor context

Repo: [Zmugha1/AgentPulse_Jason_Web](https://github.com/Zmugha1/AgentPulse_Jason_Web). Live: https://agentpulseweb.netlify.app. Supabase project **agentpulse-jason**.

## Rules added 2026-06-03

- Webhook auth failures must log a structured reason identifier before returning 401. Silent failures are not acceptable.
- Test deployed features with hard refresh (Ctrl+Shift+R) before declaring them broken. Browser cache is a real failure mode.
- Don't add timestamp-based replay protection (iat checks) without verifying the issuing service documents support for it.
- WEBHOOK_SECRET must be identical across all four locations: password manager, both Netlify sites' env vars, and local `.env.local`.
- After 6 consecutive 4xx failures, Netlify auto-disables outgoing webhooks. Always check disabled state before debugging code.
- For client-requested features, the first build should be free text not enumerated values. Add taxonomy only after seeing 6+ months of real values.
