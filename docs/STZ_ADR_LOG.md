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
