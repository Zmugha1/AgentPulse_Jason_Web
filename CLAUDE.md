# AgentPulse Jason Web — Claude / Cursor context

Repo: [Zmugha1/AgentPulse_Jason_Web](https://github.com/Zmugha1/AgentPulse_Jason_Web). Live: https://agentpulseweb.netlify.app. Supabase project **agentpulse-jason**.

## Rules added 2026-06-03

- Webhook auth failures must log a structured reason identifier before returning 401. Silent failures are not acceptable.
- Test deployed features with hard refresh (Ctrl+Shift+R) before declaring them broken. Browser cache is a real failure mode.
- Don't add timestamp-based replay protection (iat checks) without verifying the issuing service documents support for it.
- WEBHOOK_SECRET must be identical across all four locations: password manager, both Netlify sites' env vars, and local `.env.local`.
- After 6 consecutive 4xx failures, Netlify auto-disables outgoing webhooks. Always check disabled state before debugging code.
- For client-requested features, the first build should be free text not enumerated values. Add taxonomy only after seeing 6+ months of real values.

## Rules added 2026-06-04

- **UI features are not shipped until live UI is verified.** After reporting a UI-touching feature complete: hard refresh the live site (Ctrl+Shift+R), manually exercise the new UI end-to-end, verify persistence with another hard refresh, then mark shipped. Build pass + DB checks alone are insufficient.
- Optional automation: `npx tsx scripts/verify-archive-live-ui.ts` (Playwright + `.env.local` service role) for archive regression on production.

## Rules added 2026-06-04 (after STZ rollback incident)

- NEVER push a feature commit to main without explicit user approval after Step 9 (build verification).
- Live deploy verification (per UI ship rule) must happen BEFORE pushing, not after.
- If a session prompt says "wait before pushing," that instruction overrides automatic push-on-commit behavior.

## Rules added 2026-06-04 (end of session)

- Supabase Site URL must be set to the production URL (with https://) before any deploy. Check Authentication → URL Configuration on every new project.
- Redirect URLs in Supabase Auth must include the production domain with /** wildcard.
- Magic link is the emergency login path when password fails. Available from Supabase user details panel.
- When seeding content meant to represent a real person's voice, provide the source text explicitly. Cursor must not author seed content. Use copy-only prompts with prohibition language.
- Production rollback uses Netlify deploy re-publish, not git revert. Restores live bundle in 30 seconds while preserving code on main.
- Live UI verification must precede push, not follow it. The CLAUDE.md UI ship rule applies BEFORE the commit hits main.
- Cursor's default "ship fast" behavior must be explicitly overridden in every session prompt. The instruction "wait for approval before pushing" must appear in any prompt where the user wants to control push timing.
- Polished, smooth, generic content is more suspicious than awkward, specific content. Original voice has texture; fabrications are bland.

## Rules added 2026-06-05

- **Never generate or display secrets in chat.** When a new secret is needed (encryption keys, API keys, webhook secrets), instruct the user to run the generation command locally and add the value to Netlify and `.env.local` themselves. Do not paste secret values in assistant output.
- Never paste `.env.local` contents to chat for verification. Use `Measure-Object -Line` for count or run a test that exercises the secret without printing it.
- Never use placeholder text like "YOUR_KEY_HERE" in commands the user will execute. Either let the user generate the value via the command directly, or warn explicitly that the placeholder must be substituted.
- Rotation is required when any secret appears in chat output, including PowerShell output pasted to chat.
- Supabase Site URL must be set on every new project — empty Site URL silently breaks auth flows.
- Diagnose before rollback. Confirm the deploy actually caused the issue before reverting.

## Rules added 2026-06-07

- Server-only files (anthropicClient.ts pattern): `@server-only` header in file. Verify absent from browser bundle via grep on `dist/assets/*.js` for: `ANTHROPIC_API_KEY`, `anthropicClient`, `@anthropic-ai/sdk`, model name strings.
- Hallucination prevention for AI research: every claim must cite source URL, max 5 bullets per attendee, `could_not_verify` fallback. Mark in UI: "Researched from public web sources. Verify before relying on."
- Cache layer required for any paid AI API call: TTL via `expires_at` column, cache check before paid call, cost cap via UI-side attendee limit.
- Two Cursor windows = real risk: glance at workspace name in Cursor sidebar before pasting any prompt. Confirm `pwd` in Step 1 of every session.
- Browser tab discipline: every UI verification starts with "what URL is in your address bar?" before diagnosing feature visibility.

## Rules added 2026-06-08

- Password reset flow always uses window.location.origin for redirect URLs (no hardcoded domains)
- Enumeration-safe auth messages: never reveal whether an email exists in the system
- Recovery session check via user.recovery_sent_at (Supabase convention), not URL parsing
- New pages follow App.tsx pathname-check pattern, no react-router introduction

## Rules added 2026-06-13

- For Netlify env vars with known length, TYPE the value character by character into the UI. Do not paste. Paste has introduced truncation and whitespace contamination twice this week.
- After editing any Netlify env var, manually trigger Deploys → Clear cache and deploy site. Do not rely on auto-redeploy.
- Verify env var length matches expected before declaring done. UUIDs are 36 chars with 4 hyphens. GA4 numeric property IDs are 9 digits.
- For long multi-part diagnostic prompts to Cursor, require explicit confirmation of each check completed. Number the checks. Watch for skip-then-conclude pattern.
- Prefer server-side truth (database) over client-side telemetry (GA4 events) for business-critical metrics when both exist.
- GA4 Data API requires numeric Property ID (e.g. 537057869), NOT the measurement ID (G-XXXXXXXXX format used by gtag.js).
- Service account JSON keys are blocked org-wide by `iam.managed.disableServiceAccountKeyCreation`. Use OAuth for all new Google API integrations.
- After changing metric calculation logic, always wipe `ga4_metrics_cache` table to invalidate stale cached values.
- Cache invalidation order: deploy first, then wipe. Wiping before deploy refills with old calculation immediately.
- Default time-range selectors must show a window with representative data. Avoid defaults that show zeros.
- Reframe negative-sounding metrics as actionable opportunities in user-facing copy.
- Categorization logic that depends on external state (AI assistants, social platforms) belongs server-side not client-side. One source of truth, no duplication.

## Rules added 2026-06-18

- GA4 Data API custom event dimensions require the `customEvent:` prefix. Use the event parameter name not the dimension display name. Check GA4 Admin → Custom definitions before writing any GA4 query.
- After every commit, confirm Netlify Published hash matches local commit hash before testing production. Never assume auto-deploy fired.
- Every catch block must log `err.message` not just a generic reason string. Pattern: `err instanceof Error ? err.message : String(err)`
- `scan-gmail-leads` runs every 15 minutes via Netlify scheduled function. Never add a manual trigger or page-load trigger.
- `gmail_processed_messages` is the idempotency layer for Gmail lead detection. Never bypass it.
- `analytics.js` on thesuepattigroup.ai is the single source of truth for all attribution capture. Never add `gtag()` calls directly to HTML pages.
- Action buttons (Called, Voicemail, No Answer, Emailed, Not Interested) must exist and behave identically in every view where a lead appears. Never build workflow actions in one view only.
- Morning Brief actions and Lead Intelligence actions are the same five buttons with the same stage mapping. One system. No inconsistency.

## Rules added 2026-06-25

- Email signature and all AI generation context fields belong on `stz_profile`, not separate tables.
- Weekly activity metrics that use `updated_at` are vulnerable to inflation from batch operations like rescore. Document the limitation and plan a stage history table.
- Stages advanced and deals closed metrics need a stage change event log to be accurate. `updated_at` is not a reliable proxy.
- After any rescore run, Market Intel weekly metrics will show inflated numbers for that week. Warn Jason when a rescore is run.

## Rules added 2026-06-25 (continued)

- Never query raw lead source or stage values directly for display. Use `getSourceLabel()`, `getStageLabel()`, or `getEffectiveStatus()` from their respective single-source-of-truth files.
- Never use `leads.updated_at` as a proxy for user activity in any metric. Use the `interactions` table. Batch operations (rescore, migrations) touch `updated_at` without representing real work.
- Before building any new display of lead source or pipeline data, check `leadSources.ts` and `pipelineStages.ts` first for existing helpers.
- When a metric could show a misleading zero (paid source with 0% response, no data yet), use the `buildingState` pattern to show a helpful message instead of a raw number.
