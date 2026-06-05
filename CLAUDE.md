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
