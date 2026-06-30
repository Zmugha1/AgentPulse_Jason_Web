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

---

## ADR-24 — Password reset uses Supabase auth.resetPasswordForEmail with redirectTo using window.location.origin

**Date:** 2026-06-08

**Decision:** Password reset request calls `supabase.auth.resetPasswordForEmail` with `redirectTo: \`${window.location.origin}/reset-password\`` (works in local and production without hardcoding).

**Layer:** Tech / Auth

**Context:** Jason demo requires self-service password recovery. Hardcoded production URLs break local dev; hardcoded localhost breaks production email links.

**Consequence:** Forgot password page works on localhost:8888, localhost:5173, and https://agentpulseweb.netlify.app without env-specific redirect configuration in the client.

**Never do:** Hardcode agentpulseweb.netlify.app in reset redirect URLs.

---

## ADR-25 — Enumeration-safe success message on forgot password

**Date:** 2026-06-08

**Decision:** Same "if account exists" success text shown regardless of whether the email is in the database.

**Layer:** Security / Auth

**Context:** Returning different messages for known vs unknown emails enables user enumeration attacks.

**Consequence:** Forgot password page always shows: "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder." Coral error only for malformed email or network failure.

**Never do:** Reveal whether an email address is registered in AgentPulse.

---

## ADR-26 — Reset confirm page discriminates recovery sessions via user.recovery_sent_at

**Date:** 2026-06-08

**Decision:** Reset password page validates recovery session using `session.user.recovery_sent_at`, not by parsing URL hash tokens manually.

**Layer:** Tech / Auth

**Context:** Supabase appends `#access_token=...&type=recovery` to reset links. Supabase JS client detects these and creates a temporary session via `detectSessionInUrl` / `onAuthStateChange`.

**Consequence:** Page waits up to 3 seconds for Supabase to establish recovery session, then shows password form only when `recovery_sent_at` is present. Expired-link UI if not detected.

**Never do:** Parse or validate recovery tokens from the URL fragment in application code.

---

## ADR-27 — Reset password redirect uses window.location.href to clear recovery session

**Date:** 2026-06-08

**Decision:** After successful password update, redirect to `/login` via `window.location.href = '/login'` (not react-router navigate).

**Layer:** Tech / Auth

**Context:** Recovery sessions are temporary. Client-side navigation may leave recovery session state in memory.

**Consequence:** Full page navigation to login clears recovery session state completely before user signs in with new password.

**Never do:** Use in-app navigation for post-reset redirect without clearing auth state.

---

## ADR-28 — App.tsx pathname-check routing extended for auth pages

**Date:** 2026-06-08

**Decision:** New pages `/forgot-password` and `/reset-password` use existing App.tsx pathname-check routing pattern. No react-router introduction.

**Layer:** Tech / Frontend

**Context:** Project has no react-router dependency. Integrations tab and auth routes already use `window.location.pathname` guards in App.tsx.

**Consequence:** Reset and forgot password pages render via early return in App.tsx before authenticated shell or login form. Netlify SPA redirect (`/*` → index.html) serves both routes.

**Never do:** Introduce react-router for one or two auth pages when pathname checks already work.

---

## ADR — Service account auth blocked by org policy

**Date:** 2026-06-13

**Decision:** Use OAuth instead of service account JSON for GA4 access.

**Layer:** Tech

**Context:** Org policy `iam.managed.disableServiceAccountKeyCreation` blocks creating downloadable JSON keys for service accounts in agentpulse-prod project.

**Consequence:** GA4 reads happen via existing user OAuth token. Each user must connect their own Google account with analytics permission. Reuses calendar OAuth pattern.

**Never do:** Try to download service account JSON keys from this org — will fail.

---

## ADR — Lead conversion rate uses Supabase real submissions not GA4 events

**Date:** 2026-06-13

**Decision:** Calculate `lead_conversion_rate` from `website_lead_submissions` table, not from GA4 `generate_lead` event count.

**Layer:** L5 Evaluation

**Context:** GA4 `generate_lead` event was either not firing or not being received. We have a more reliable source — the Phase 6 poller writes real form submissions to `website_lead_submissions` in Supabase. Newsletter signups excluded from lead count by design.

**Consequence:** Lead conversion rate reflects actual captured leads, not telemetry events. Decoupled from website-side GA4 instrumentation quality. Cache must be wiped after this change.

**Never do:** Mix server-truth metrics with client-side event telemetry in same calculation.

---

## ADR — Market Intel default range is last_30_days

**Date:** 2026-06-13

**Decision:** Default selected range pill is `last_30_days`, not `last_7_days`.

**Layer:** L1 Prompts (UI default)

**Context:** 7-day data window often shows 0 leads given current real estate funnel velocity. 30-day window shows real conversion activity.

**Consequence:** First view a user lands on shows representative data, not deceptively zero numbers. User can toggle 7-day if desired.

**Never do:** Default to a window so short it makes real data look broken.

---

## ADR — Categorization logic lives in AgentPulse server, not website JS

**Date:** 2026-06-13

**Decision:** Traffic source categorization happens server-side in AgentPulse at GA4 read time. Website pushes raw signals only (referrer, UTMs).

**Layer:** Tech

**Context:** Categorization rules will evolve (new AI assistants launch, new social platforms emerge). Three duplicated categorization implementations existed on thesuepattigroup.ai causing maintenance burden.

**Consequence:** One source-of-truth categorization function in AgentPulse. Website redeploy not required when categorization rules change.

**Never do:** Duplicate categorization logic across website pages. Never let business logic drift across three implementations.

---

## ADR — GA4 Property ID vs Measurement ID

**Date:** 2026-06-13

**Decision:** GA4 Data API requires the numeric Property ID (537057869), NOT the measurement ID (G-WBWHJYPG12 used by gtag.js).

**Layer:** Tech

**Context:** First implementation attempted to use measurement ID where Data API expected property ID. Caused 404 / scope_insufficient confusion in production.

**Consequence:** `GA4_PROPERTY_ID` env var holds the numeric property ID only. Measurement ID stays on the website gtag config only.

**Never do:** Pass G-XXXXXXXXX strings to GA4 Data API. Never confuse the two IDs.

---

## ADR — Env var values must be TYPED not pasted into Netlify

**Date:** 2026-06-13

**Decision:** When updating env vars in Netlify UI, TYPE the value character by character, do not paste.

**Layer:** Tech

**Context:** `WEBSITE_NETLIFY_SITE_ID` and `GA4_PROPERTY_ID` both suffered from paste-induced truncation or whitespace contamination. Caused days of debugging.

**Consequence:** Env var updates require typing into the field with Notepad verification of length BEFORE saving. After saving, trigger manual redeploy to force functions to pick up new value.

**Never do:** Paste env var values into Netlify UI without verifying length in Notepad first.

---

## ADR — Gmail lead detection uses scheduled Netlify function

**Date:** 2026-06-18

**Decision:** `scan-gmail-leads.ts` runs every 15 minutes via Netlify scheduled function using existing OAuth tokens from `google_oauth_tokens` table.

**Layer:** Tech

**Context:** Zillow and Realtor.com do not provide OAuth API keys. Email is the only available integration path. Gmail API with readonly scope gives access to lead notification emails.

**Consequence:** Leads land in AgentPulse within 15 minutes of the email arriving. `gmail_processed_messages` table prevents duplicate processing.

**Never do:** Poll Gmail on every page load. Use scheduled function only.

---

## ADR — GA4 custom event dimensions require customEvent: prefix

**Date:** 2026-06-18

**Decision:** All custom event dimensions in GA4 Data API calls must use the `customEvent:` prefix, e.g. `customEvent:referrer_domain` not `referrer_domain`.

**Layer:** Tech

**Context:** Three consecutive deploy-fix-deploy cycles were required because GA4 rejected dimension names without the prefix. Each rejection required reading the Netlify function log to get GA4's exact error message.

**Consequence:** Any future GA4 custom dimension query must use `customEvent:` prefix. The event parameter name (not the dimension display name) is what GA4 uses in the API.

**Never do:** Use a GA4 custom dimension display name in the API. Always use the event parameter name with `customEvent:` prefix.

---

## ADR — GA4 event parameter name drives the API dimension name

**Date:** 2026-06-18

**Decision:** When querying GA4 Data API for a custom dimension, use the event parameter value not the dimension display name. `utm_source_captured` display name has event parameter `utm_source`, so the correct API call is `customEvent:utm_source`.

**Layer:** Tech

**Context:** `utm_source_captured` failed even with the `customEvent:` prefix because the event parameter registered in GA4 admin was `utm_source` not `utm_source_captured`.

**Consequence:** Before writing any GA4 custom dimension query, check GA4 Admin → Custom definitions and read the User Property/Parameter column. That value is what goes after `customEvent:` in the API call.

**Never do:** Assume the dimension display name matches the event parameter name.

---

## ADR — Phase A analytics.js is single source of truth

**Date:** 2026-06-18

**Decision:** `js/analytics.js` on thesuepattigroup.ai is the only place gtag is loaded and attribution is captured. All 13 HTML pages include this one file.

**Layer:** Tech

**Context:** Three separate categorization implementations existed across the 13 pages causing maintenance burden and inconsistent data.

**Consequence:** Any change to attribution capture or gtag configuration happens in one file only. Never add gtag calls directly to HTML pages.

**Never do:** Add inline `gtag()` calls to any HTML page. Never duplicate analytics logic across pages.

---

## ADR — Morning Brief actions and Lead Intelligence actions must be identical

**Date:** 2026-06-18

**Decision:** The five action buttons (Called, Voicemail, No Answer, Emailed, Not Interested) must exist and behave identically in both Morning Brief and Lead Intelligence. Lead Intelligence currently has none of these buttons. This is a known gap to fix.

**Layer:** L3 Agents

**Context:** Jason noticed the inconsistency. He can action a lead in Morning Brief but cannot action the same lead in Lead Intelligence. The two views are disconnected.

**Consequence:** Next build session must add the five action buttons to Lead Intelligence lead rows with the same stage mapping as Morning Brief.

**Never do:** Build workflow actions in one view without adding them to all views where the same lead appears.

---

## ADR — Email signature stored in stz_profile

**Date:** 2026-06-25

**Decision:** Jason's email signature is stored as `email_signature` column on `stz_profile` table, not a separate table or env var.

**Layer:** Tech

**Context:** Signature needs to travel with the voice profile so `draft-email.ts` can access both in one query.

**Consequence:** Any future profile fields that affect AI generation belong on `stz_profile`.

**Never do:** Store AI generation context in separate tables that require extra joins.

---

## ADR — Weekly activity uses updated_at not stage change events

**Date:** 2026-06-25

**Decision:** `stages_advanced` counts leads where `updated_at` changed this week and stage is not `new`/`inactive`/`dead`.

**Layer:** L5 Evaluation

**Context:** No stage history table exists. Using `updated_at` is the only available signal.

**Consequence:** Rescore runs inflate `stages_advanced` because they update `updated_at` on many rows. Metric needs refinement once a stage history table exists.

**Never do:** Use `updated_at` as a proxy for user actions without documenting the limitation.

---

## ADR — Weekly activity function uses POST not GET

**Date:** 2026-06-25

**Decision:** `fetch-weekly-activity.ts` uses POST to match existing Netlify function patterns in this codebase.

**Layer:** Tech

**Context:** All existing Netlify functions use POST. Auth via Authorization header requires POST. Consistency with `fetch-website-metrics`.

**Never do:** Mix GET and POST patterns for authenticated Netlify functions in this repo.

---

## ADR — Source performance table replaces pie chart

**Date:** 2026-06-25

**Decision:** Market Intel "Where your leads come from" section now shows a conversion table (total, worked, advanced, closed, conversion rate) per consolidated source group instead of a pie chart with raw DB values.

**Layer:** L5 Evaluation

**Context:** Pie chart showed `realtor_com_full`, `realtor_contacts`, `realtor_com_connections_plus` as separate slices. Looked like a debug screen. No conversion insight existed anywhere.

**Consequence:** This table is the primary sales asset for demonstrating AgentPulse to other realtors. Any new lead source must be added to the `SOURCE_GROUP_ORDER` mapping in `marketIntelService.ts`.

**Never do:** Display raw database source values anywhere in client-facing UI. Always consolidate through `getSourceLabel()` or source group mapping.

---

## ADR — Weekly activity metrics use interaction events not updated_at

**Date:** 2026-06-25

**Decision:** `stages_advanced` and `deals_closed` in `fetch-weekly-activity.ts` count distinct leads with an interaction in the week range, then check current `pipeline_stage`. Replaced the `updated_at`-based queries.

**Layer:** Tech

**Context:** Batch operations like rescore touch `updated_at` on hundreds of leads, making any metric based on `updated_at` unreliable as a proxy for real user activity. Verified: 808 inflated to 30 (matching leads worked) after the fix.

**Consequence:** Any future metric measuring user activity must use the `interactions` table as source of truth, never `updated_at` on leads.

**Never do:** Use `leads.updated_at` as a signal for "this happened because of user action." Batch scripts, rescoring, and migrations all touch `updated_at` without representing real activity.

---

## ADR — Pipeline stage labels centralized in pipelineStages.ts

**Date:** 2026-06-25

**Decision:** Removed the duplicate `STAGE_LABELS` constant in `MarketIntel.tsx`. All stage label display now goes through `getStageLabel()` from `src/lib/pipelineStages.ts`.

**Layer:** Tech

**Context:** `MarketIntel.tsx` had its own outdated label map showing Contacted, Attempted, Nurture instead of Jason's actual stage language. Two sources of truth had drifted apart.

**Consequence:** Any new page or component that displays `pipeline_stage` must import `getStageLabel()` rather than defining its own label map.

**Never do:** Create a second stage label mapping anywhere in the codebase. One source of truth only: `pipelineStages.ts`.

---

## ADR — MetricCard buildingState pattern for insufficient-data states

**Date:** 2026-06-25

**Decision:** `WeeklyActivitySummary` `MetricCard` accepts an optional `buildingState` prop that overrides the normal value and comparison display with a custom message when there is not yet enough data to show a meaningful metric.

**Layer:** L1 Prompts (UI pattern)

**Context:** Realtor.com Response showed a misleading 0.0% when Jason had not worked any Realtor.com leads in AgentPulse yet. A 0% on a paid source looks broken to a prospect.

**Consequence:** Any future metric card with a similar cold-start problem should use the same `buildingState` pattern rather than inventing a new approach.

**Never do:** Show a numeric 0 or 0% for a metric when the real meaning is "no data collected yet." Always distinguish "zero activity" from "zero results from real activity."

