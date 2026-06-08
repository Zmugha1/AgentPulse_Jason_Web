# STZ Architecture Decision Record Log

---

## ADR — Netlify Form Webhooks use JWS, not custom headers

**Date:** 2026-06-03

**Decision:** Webhook function verifies JWS signatures from Netlify Forms outgoing webhooks. Custom headers are not supported by Netlify Forms UI.

**Layer:** Tech / L3

**Context:** Initial Phase 6 Part 1 design assumed Netlify Forms supported custom HTTP headers for webhook authentication. The actual UI only offers a JWS secret token field. Required mid-build refactor.

**Consequence:** All website-to-AgentPulse authentication uses JWS signature verification. Function code reads X-Webhook-Signature header, verifies with WEBHOOK_SECRET as HMAC SHA-256 key, checks iss=netlify and sha256 of raw body.

**Never do:** Assume webhook UIs support arbitrary headers. Always check the destination service's actual UI before designing auth.

---

## ADR — Replay protection delegated to JWS secret confidentiality

**Date:** 2026-06-03

**Decision:** Removed iat timestamp check from webhook authentication.

**Layer:** Tech / L3

**Context:** Initial implementation required JWT iat claim within 5-minute window for replay protection. Netlify's JWS spec does not document supporting iat. Real production retries (Netlify retries with same JWT) failed silently because iat was stale.

**Consequence:** Function accepts any JWS signature with valid iss and sha256, regardless of age. Security depends on WEBHOOK_SECRET confidentiality.

**Never do:** Add timestamp-based replay protection without verifying the issuing service documents support for it.

---

## ADR — Lead purpose is free text, not enumerated

**Date:** 2026-06-03

**Decision:** purpose column on leads table is nullable text, no constraints.

**Layer:** L2 (data model)

**Context:** Jason's examples ("lake property", "guest house", "looking to rent") show purpose is descriptive narrative, not a category. Free text gives flexibility for the kinds of distinctions that matter per-lead.

**Consequence:** No dropdown lists, no validation on purpose values. UI shows free-text input with 200-char limit. Chatbot webhook composes purpose strings from area/beds/pre_approved/timeline fields.

**Never do:** Constrain purpose to a fixed taxonomy without seeing 6+ months of real Jason-entered values first.

---

## ADR — Authentication failures must be structured-logged

**Date:** 2026-06-03

**Decision:** Every 401 in webhook function logs a specific reason identifier before returning.

**Layer:** Tech / L5 (evaluation)

**Context:** Silent 401s during JWS rollout left no diagnostic trail. Real production failures over 6+ attempts produced no log line.

**Consequence:** All auth failure paths log [website-lead] auth_fail reason=<identifier> with one of: missing_signature_header, jwt_verify_failed, wrong_issuer, missing_sha256_claim, hash_mismatch.

**Never do:** Return a security-related error code without logging the reason. Diagnostics are not a luxury, they are the only way to recover from production failure.

---

## ADR — Supabase Site URL must be set before any deploy

**Date:** 2026-06-04

**Decision:** The Supabase Auth → URL Configuration → Site URL field must contain the production URL before any deploy. Empty Site URL breaks login flows, magic links, and password recovery redirects in unpredictable ways.

**Layer:** Tech / L4

**Context:** Login broke on agentpulseweb.netlify.app with "Invalid credentials" and "No API key found in request" errors. After hours of investigation, root cause was an empty Site URL in Supabase URL Configuration. The field was never set when Supabase was initially configured. Authentication had appeared to work previously only because browser session tokens persisted; fresh login attempts in incognito surfaced the broken state.

**Consequence:** Site URL must be configured to https://agentpulseweb.netlify.app and Redirect URLs must include https://agentpulseweb.netlify.app/** before any deploy goes live. This becomes a pre-flight check for any Supabase project.

**Never do:** Set up a new Supabase project without immediately configuring Site URL and Redirect URLs.

---

## ADR — Cursor must not author seed data text

**Date:** 2026-06-04

**Decision:** When seeding domain content (STZ answers, voice library, identity data, anything representing a real person's words), the source text must be provided to Cursor explicitly. Cursor must not generate or paraphrase the text.

**Layer:** L1 / L4

**Context:** Phase 6 Part 0 STZ seed step had Cursor "seed Jason's BNI answers" without providing the BNI transcript as a file Cursor could read. Cursor generated 25 entirely fabricated answers, including the wrong last name ("Jason Patterson" instead of "Jason Patti"), wrong geographic market, and entirely AI-generated sales copy that bore no resemblance to Jason's actual BNI presentation. Caught only because Zubia spot-checked q1_1 against her drafted source. Could have shipped to Jason as "his profile."

**Consequence:** All future seed work must include the source content as a file Cursor reads verbatim. Cursor's job in seeding is copy-paste, not authorship. Prompts must include the prohibition "do not write, paraphrase, summarize, or improve any text."

**Never do:** Tell Cursor to "seed answers from a transcript" without providing the transcript content directly.

---

## ADR — UI ship rule must include pre-push verification

**Date:** 2026-06-04

**Decision:** The CLAUDE.md UI ship rule "hard-refresh + end-to-end + persistence before declaring shipped" is amended to require this verification BEFORE pushing to main, not after.

**Layer:** Tech / L5

**Context:** Cursor pushed two commits today without prior live UI verification: f5fd6fe (sidebar) Step 8 was skipped, relying on later Playwright verification; 26fb833 (STZ form) was pushed before Step 10 and before Zubia approved. The latter went live during a Supabase auth outage and contained hallucinated content, worsening the incident.

**Consequence:** Future prompts must explicitly state "do not push until Zubia approves" between build verification and push. CLAUDE.md gains: "Live deploy verification must happen BEFORE pushing, not after."

**Never do:** Push a UI commit to main without Zubia's explicit approval after build verification. Speed does not override verification.

---

## ADR — Production rollback via Netlify deploy, not git revert

**Date:** 2026-06-04

**Decision:** For UI/deploy regressions, the rollback path is Netlify deploy re-publish, not git revert. Code stays on main; only the live bundle rolls back.

**Layer:** Tech

**Context:** When STZ commit 26fb833 was suspected of breaking login, rollback was needed fast. Git revert would have introduced a new commit, polluted history, and triggered another deploy cycle. Netlify "Publish deploy" on the prior good build (cbc82d9) restored the live bundle in 30 seconds while preserving all code on main.

**Consequence:** Standard rollback runbook is Netlify deploy re-publish. Git revert only for cases where the code itself is unrecoverable.

**Never do:** Use git revert as the first response to a production deploy issue. Try Netlify deploy re-publish first.

---

## ADR — Token encryption via AES-256-GCM env-var key

**Date:** 2026-06-05

**Decision:** Google OAuth access and refresh tokens are encrypted at rest in Supabase using AES-256-GCM. Key material comes from TOKEN_ENCRYPTION_KEY (32-byte hex in env vars only).

**Layer:** Tech / L4

**Context:** Phase 6 Part 3 stores Gmail and Calendar OAuth tokens for future Phase 7 automation. Plaintext storage in google_oauth_tokens would expose long-lived refresh tokens if the database were compromised.

**Consequence:** encryptToken/decryptToken in src/lib/tokenCrypto.ts. Netlify Functions encrypt before upsert; decryption only on server. Key must exist in Netlify (Builds + Functions + Runtime) and local .env.local. Never commit or paste key values in chat.

**Never do:** Store OAuth refresh tokens in plaintext. Never generate or display TOKEN_ENCRYPTION_KEY in assistant output — instruct the human to run the generator locally.

---

## ADR — OAuth flow via Netlify Functions, not client-side

**Date:** 2026-06-05

**Decision:** Google OAuth authorization code exchange runs in Netlify Functions (google-oauth-start, google-oauth-callback, google-oauth-disconnect). GOOGLE_OAUTH_CLIENT_SECRET never enters the browser bundle.

**Layer:** Tech / L3

**Context:** Client-side OAuth would require exposing the client secret or using less secure patterns. Server-side exchange keeps secrets on Netlify and tokens encrypted before persistence.

**Consequence:** Frontend calls /api/google-oauth-start with Supabase JWT; callback at /auth/google/callback hits google-oauth-callback function; disconnect revokes at Google then deletes row server-side.

**Never do:** Put GOOGLE_OAUTH_CLIENT_SECRET in Vite env (VITE_*) or frontend code.

---

## ADR — CSRF state via oauth_state table with 10-minute TTL

**Date:** 2026-06-05

**Decision:** OAuth start generates a UUID state token stored in oauth_state with user_email. Callback rejects state older than 10 minutes or not found.

**Layer:** Tech / L4

**Context:** Google OAuth requires state parameter for CSRF protection. Ephemeral server-side storage ties state to AgentPulse user and limits replay window.

**Consequence:** oauth_state table (service role only). google-oauth-start inserts state; google-oauth-callback validates created_at within 10 minutes, then deletes used state.

**Never do:** Honor OAuth callbacks without state validation or accept expired state tokens.

---

## ADR — OAuth success redirect uses /integrations query params

**Date:** 2026-06-05

**Decision:** After OAuth callback, redirect to /integrations?status=connected (or status=error&reason=...). Integrations page reads params once, shows toast, clears URL with history.replaceState.

**Layer:** Tech / L2

**Context:** App uses tab-based navigation without React Router. Callback must land on Integrations tab; App.tsx sets activeTab=integrations when pathname is /integrations.

**Consequence:** netlify.toml maps /auth/google/callback to callback function. Success and error UX is URL-driven toast on Integrations mount.

**Never do:** Redirect OAuth callback to Morning Brief default tab without opening Integrations.

---

## ADR — Secrets must never be displayed in chat output

**Date:** 2026-06-05

**Decision:** When Cursor generates a secret (encryption key, API key, token, password), it must NOT print the value to chat. Instead, it instructs the user to run the generation command themselves and keep the value local. The user pastes secrets to env files directly, never back to Cursor or to Claude.

**Layer:** Tech / Security

**Context:** During Phase 6 Part 3 OAuth build, Cursor's Step 2 generated TOKEN_ENCRYPTION_KEY and printed the full 64-char hex value in chat output. This exposed the key to the conversation history. Discarded and regenerated. Separately, GOOGLE_OAUTH_CLIENT_SECRET appeared in a PowerShell command output that was pasted to chat during a file-editing diagnostic, requiring rotation in Google Cloud Console.

**Consequence:** All future Cursor prompts involving secrets must include the rule "do not generate or display secret values in chat output." When a secret needs to be created, Cursor instructs the user with the generation command and the user runs it locally.

**Never do:** Print or echo a secret value to chat output, even with intent to share with the user. The user runs the command themselves.

---

## ADR — Local env file edits via PowerShell append, not editor copy-paste

**Date:** 2026-06-05

**Decision:** For adding new env vars to `.env.local`, use PowerShell `Add-Content` command instead of opening in an editor and saving. Reduces risk of formatting errors (mashed-together lines, missing newlines, unsaved buffer) that break the entire file.

**Layer:** Tech / Process

**Context:** Three separate attempts to add TOKEN_ENCRYPTION_KEY to `.env.local` failed for different reasons: (1) edited but not saved, (2) added literal placeholder text "YOUR_64_CHAR_HEX_KEY_HERE" instead of the actual value, (3) Add-Content ran but the value written was the placeholder literal, causing mangled file. Required Notepad manual cleanup.

**Consequence:** When adding to `.env.local`, run something like:

`Add-Content -Path .env.local -Value "KEY_NAME=actual_value"`

Then verify with: `Get-Content .env.local | Measure-Object -Line`

Should show expected number of lines. If file is mangled, open in Notepad and manually fix line breaks.

**Never do:** Tell Cursor or anyone "use Add-Content with YOUR_KEY_HERE as a placeholder" — the placeholder gets written literally. Always paste the actual value into the command.

---

## ADR — Production rollback isn't always the right diagnostic step

**Date:** 2026-06-05

**Decision:** When a recent deploy is suspected of breaking something, rollback should not be the first action. Diagnose the actual cause first. Rollback can mask the real problem and create a false sense of fix.

**Layer:** Process

**Context:** Yesterday's rollback of commit 26fb833 was based on the assumption that the STZ commit broke login. Today's diagnostic work would have shown that login had been broken since the start — the Supabase Site URL was never configured. The STZ commit was innocent. Rollback wasted ~30 minutes and created confusion about what was actually broken.

**Consequence:** When something appears broken after a deploy:

1. First, check whether the issue exists on previous deploys
2. Reproduce locally if possible
3. Identify root cause before rolling back
4. Rollback only after confirming the deploy actually caused it

**Never do:** Roll back as a first response to a production issue. Diagnose first.

---

## ADR-16 — Phase 7a-extended scope: today + 6 days, not calendar week

**Date:** 2026-06-07

**Decision:** Morning Brief week view shows today plus the next six days (seven days total), not a Sun–Sat or Mon–Sun calendar week.

**Layer:** Product / L2

**Context:** Calendar-week boundaries add edge cases (events spanning week lines, timezone at midnight Sunday). Jason's workflow is "what's ahead from today," not "this ISO week."

**Consequence:** `range=week` uses `timeMin=today_start`, `timeMax=today_start + 7 days` in America/Chicago. UI groups by day key with today expanded by default.

**Never do:** Switch to ISO calendar week without explicit user request and a timezone strategy review.

---

## ADR-17 — meeting_notes table: prep notes keyed by user_email + calendar_event_id

**Date:** 2026-06-07

**Decision:** Meeting prep notes persist in `meeting_notes` keyed by `(user_email, calendar_event_id)` with RLS SELECT/INSERT/UPDATE only (no DELETE for authenticated).

**Layer:** Data / L3

**Context:** Prepare panel needs durable notes per calendar event without tying notes to lead rows. One note row per user per Google event id.

**Consequence:** `saveNotesForEvent` upserts on unique constraint. Service role can DELETE for future cleanup. Notes survive panel close and reopen.

**Never do:** Add DELETE policy for authenticated on meeting_notes without an explicit user-facing delete UX.

---

## ADR-18 — research_briefs table: 30-day TTL cache for Anthropic research

**Date:** 2026-06-07

**Decision:** AI attendee research is cached in `research_briefs` keyed by `(user_email, calendar_event_id, attendee_email)` with `expires_at = now() + 30 days`.

**Layer:** Data / L3 / Cost

**Context:** Anthropic web-search calls cost roughly $0.02–0.05 per attendee. Reopening Prepare on the same event must not re-bill.

**Consequence:** `research-attendee` function checks cache before calling Anthropic. Upsert refreshes content and extends expiry on cache miss. Index on `expires_at` supports future TTL cleanup job.

**Never do:** Call a paid Anthropic research endpoint without a server-side cache check first.

---

## ADR-19 — Anthropic claude-sonnet-4-5 over Google People API for attendee research

**Date:** 2026-06-07

**Decision:** Use Anthropic `claude-sonnet-4-5` with `web_search_20250305` for Public Research, not Google People API.

**Layer:** Tech / L4

**Context:** Google People API returns the authenticated user's own contacts, not arbitrary attendee public profiles. Prepare needs public professional info for calendar attendees who may not be in Jason's contact list.

**Consequence:** Server-side `research-attendee` Netlify function calls Anthropic. `ANTHROPIC_API_KEY` lives in Netlify env only.

**Never do:** Assume OAuth contact scopes substitute for public attendee research.

---

## ADR-20 — Hallucination prevention pattern for AI research bullets

**Date:** 2026-06-07

**Decision:** Every research bullet must cite a `source_url`; max 5 bullets per person; uncited bullets show "(source not cited)" in coral; unfindable people return `could_not_verify: true`.

**Layer:** Product / L5 / Safety

**Context:** Real estate prep mistakes from fabricated attendee background are worse than no research. Citations force model and UI to stay factual.

**Consequence:** Prompt requires JSON `{ bullets: [{text, source_url}], could_not_verify }`. UI banner: "Researched from public web sources. Verify before relying on." No personality or motivation inference in prompts.

**Never do:** Show AI research bullets as verified facts without a source link or an explicit could_not_verify state.

---

## ADR-21 — Server-only enforcement for anthropicClient.ts

**Date:** 2026-06-07

**Decision:** `src/lib/anthropicClient.ts` is server-only. File carries `@server-only` header. Browser bundle must not contain API key, SDK, or model strings from that module.

**Layer:** Tech / Security

**Context:** Anthropic API key in a Vite client bundle would be a critical leak. Netlify functions import the module; React components call `/api/research-attendee` only.

**Consequence:** Step 10 build verification greps `dist/assets/*.js` for `ANTHROPIC_API_KEY`, `anthropicClient`, `@anthropic-ai/sdk`, `claude-sonnet-4-5`. All absent from client bundle on 2026-06-07 build.

**Never do:** Import `anthropicClient.ts` from any file under `src/pages`, `src/components`, or client-side services.

---

## ADR-22 — Cost guardrails for Prepare-panel research

**Date:** 2026-06-07

**Decision:** Cache-first lookup before Anthropic call; skip research for attendee emails already matched to leads; cap at 5 non-lead attendees researched per Prepare click.

**Layer:** Product / Cost

**Context:** Events with many attendees could trigger runaway API spend. Matched leads already have AgentPulse context.

**Consequence:** `EventPreparePanel` filters out lead-matched emails before calling `researchAttendee`. Overflow message: "5+ attendees, showing first 5 for cost efficiency."

**Never do:** Research all attendee emails on an event without a per-click cap.

---

## ADR-23 — Range parameter on calendar-events: today (default) or week

**Date:** 2026-06-07

**Decision:** `calendar-events` Netlify function accepts `?range=today` (default, backward compatible) or `?range=week`.

**Layer:** Tech / API

**Context:** Phase 7a callers use today. Phase 7a-extended Morning Brief needs seven-day window without breaking existing behavior.

**Consequence:** Default omitted or `range=today` unchanged from Phase 7a. `range=week` widens `timeMin`/`timeMax` only. Same response shape `{ events: [...] }`.

**Never do:** Remove `range=today` support or change its time bounds when adding new range values.
