# STZ Postmortem Library

---

## INC — Webhook config typo: WEBHOOK_SECET

**Date:** 2026-06-03

**What broke:** WEBHOOK_SECRET env var in agentpulseweb was misspelled WEBHOOK_SECET (missing R). Function code looked for correct name, would have failed all webhook auth.

**Root cause:** Typo during manual env var entry in Netlify dashboard.

**Fix applied:** Caught during pre-deploy verification by screenshot review. Renamed env var in Netlify UI.

**Prevention rule:** Always re-read env var keys character-by-character before saving, especially security-critical ones.

**Commit:** N/A (config-only fix)

---

## INC — Silent 401 rejections from Netlify Forms webhook

**Date:** 2026-06-03

**What broke:** Live webhook configured in thesuepattigroup Netlify dashboard fired 15 requests in 1 hour, 60% with errors. Netlify dashboard showed duration but no status code or error message.

**Root cause:** Three compounding issues. (1) iat timestamp check rejecting Netlify retries with stale signatures. (2) No structured logging on auth failures meant all 401s were silent. (3) After 6 consecutive failures, Netlify auto-disabled the webhook.

**Fix applied:** Removed iat requirement (kept iss + sha256). Added structured logging on every 401 with reason identifier. Re-enabled the webhook in thesuepattigroup Netlify UI.

**Prevention rule:** Webhook handlers must log auth failure reasons. Replay protection requires verifying the source service supports the timestamp claim. Test against real source service before assuming test-mock signatures represent production.

**Commit:** 08ab9f5 (JWS implementation), af73130 (logging + iat removal)

---

## INC — Browser cache showed pre-deploy version after Phase 5 Part 1 feature shipped

**Date:** 2026-06-03

**What broke:** After c8ec438 deployed, purpose UI did not appear on Lead Intelligence page. Initially appeared as a missing feature, suggesting Cursor's implementation didn't deploy.

**Root cause:** Browser cached the pre-deploy JS bundle. Hard refresh (Ctrl+Shift+R) loaded the new bundle and the UI appeared correctly.

**Fix applied:** Hard refresh. No code change needed.

**Prevention rule:** Before declaring a deployed feature broken, hard refresh first. Cache invalidation is a real failure mode.

**Commit:** N/A (no fix needed)

---

## INC-4

**Date:** 2026-06-04

**What broke:** Live login returned "No API key found in request" after deploy of commit 26fb833 (Phase 6 Part 0 follow-up STZ form). Despite the JS bundle containing both VITE_SUPABASE_URL and the sb_publishable_ key, the apikey header was not being sent on auth requests.

**Root cause:** Under investigation. Possible causes include the new sb_publishable_ key format being rejected by Supabase auth, browser cache issues, or a subtle initialization timing bug introduced by the new MyAgentPulse.tsx useEffect on getSession().

**Fix applied:** Netlify deploy rollback to commit cbc82d9 (sidebar verification). The 26fb833 commit remains on main; only the live deploy was rolled back.

**Prevention rule:** Do not push UI commits to main until live UI verification passes. The CLAUDE.md ship rule was violated when 26fb833 pushed before live verification. Stricter enforcement needed in future prompts.

**Commit:** N/A (rollback was via Netlify deploy republish, not git)

---

## INC — Login broken by empty Supabase Site URL

**Date:** 2026-06-04

**What broke:** agentpulseweb.netlify.app login returned "Invalid login credentials" for known-good zubiaml4l@gmail.com. Password reset emails redirected to http://localhost (refused connection). Initially symptom was confused with "No API key found in request" on auth/v1/token endpoint.

**Root cause:** Supabase Auth → URL Configuration → Site URL field was empty. This field controls the default redirect URL for auth flows including password recovery, magic link, and email confirmation. With no value set, Supabase used localhost as fallback, breaking the entire redirect chain. The login form errors ("No API key" and "Invalid credentials") were symptoms of failed redirect handshakes, not actual credential mismatches.

**Fix applied:**

1. Set Site URL to https://agentpulseweb.netlify.app
2. Added https://agentpulseweb.netlify.app/** to Redirect URLs
3. Used "Send magic link" from Supabase user details panel to bypass broken redirect path and log in directly
4. Set new password from within authenticated session

**Prevention rule:** For any new Supabase project, the first configuration step after creating the project is to set Site URL and Redirect URLs in Authentication → URL Configuration. This is now an ADR (see ADR log).

**Commit:** N/A (Supabase dashboard configuration, not code)

---

## INC — Cursor fabricated 25 STZ seed answers as "Jason's voice"

**Date:** 2026-06-04

**What broke:** Phase 6 Part 0 STZ seed step instructed Cursor to seed Jason's 25 STZ answers from his BNI transcript. The BNI transcript was not in the repo (it had been pasted into the conversation, not committed). Cursor could not find the source text and generated 25 entirely fabricated answers, including the wrong last name ("Patterson" instead of "Patti"), wrong geographic focus ("southeastern Wisconsin" instead of "Lake Country"), and AI-generated sales copy ("relationships built to last beyond one transaction") that Jason had never said. The fabricated content was written to production Supabase as Jason's "verified profile."

**Root cause:** Two compounding failures. (1) The original session prompt told Cursor to seed from the BNI transcript without providing the transcript text in a way Cursor could read. (2) Cursor did not stop when the source was unavailable. Instead, it generated its own content and labeled it bni_transcript_seeded.

**Caught by:** Spot-check of q1_1 against Zubia's drafted source text.

**Fix applied:**

1. Zubia drafted 25 verified BNI-voice answers in a fresh file (stz-seed-data.ts)
2. Cursor prompt rewritten in copy-only mode with explicit prohibitions on writing, paraphrasing, or modifying any text
3. Cursor replaced src/lib/stz-seed-data.ts with verified content
4. Seed script run with UPDATE (not delete-then-insert) to refresh Jason's existing row with correct text
5. Live verification confirmed q1_1 reads "Real estate professional, 21 years in business..." in production

**Prevention rule:** All seed work involving a real person's voice must include the source content explicitly. Cursor's job is copy-paste, not authorship. See ADR for full discipline.

**Commit:** fd1c207 (corrected seed)

---

## INC — STZ commit pushed before live UI verification

**Date:** 2026-06-04

**What broke:** Commit 26fb833 (STZ form feature) was pushed to main before Step 10 of the session prompt and before Zubia's explicit approval. The CLAUDE.md UI ship rule from 6/3 explicitly requires hard-refresh + end-to-end + persistence on the live site before declaring shipped. Cursor skipped that.

**Root cause:** Cursor's default behavior treats "Step 9 build passes" as license to push. The session prompt's "wait before push" instruction was not strong enough to override this default.

**Fix applied:**

1. CLAUDE.md updated with stronger language: "Live deploy verification must happen BEFORE pushing, not after."
2. Future session prompts must explicitly state "do not push without Zubia's approval after Step 9."

**Prevention rule:** Push only with explicit human approval after build verification, not before.

**Commit:** Process change, no code commit

---

## INC — Sidebar refactor pushed without local verification (Phase 6 Part 0)

**Date:** 2026-06-04

**What broke:** Earlier today, commit f5fd6fe (sidebar refactor) was pushed with Step 8 (local verification) explicitly marked "Covered by live Playwright run (Step 11/12) — all checks passed on production after deploy." Cursor inverted the order: pushed first, verified live after.

**Root cause:** Same as above. Cursor optimizes for "ship fast" rather than "verify locally first."

**Fix applied:** Process rule strengthened in CLAUDE.md. No code change needed since live verification did eventually pass.

**Prevention rule:** Local verification must precede commit. Live verification must precede push (or post-push regression risk is accepted explicitly by Zubia).

**Commit:** f5fd6fe (the offending push)

---

## INC — TOKEN_ENCRYPTION_KEY generated by Cursor in chat output

**Date:** 2026-06-05

**What broke:** During Phase 6 Part 3 OAuth Step 2, Cursor printed the generated TOKEN_ENCRYPTION_KEY (64-char hex string) directly in chat. This exposed the secret to conversation history.

**Root cause:** Cursor's default helpful behavior includes showing generated values to the user for convenience. The Step 2 prompt did not explicitly forbid displaying the value.

**Fix applied:**

1. Zubia generated a fresh key herself via PowerShell node command, never sharing the value back to chat
2. Added rule to CLAUDE.md: "Cursor must never generate or display secrets in chat output"
3. Added ADR (see ADR log)
4. Discarded the exposed key (never used in production)

**Prevention rule:** All future prompts involving secrets must include the explicit prohibition: "do not generate or display secret values in chat output." User generates locally, pastes to env vars only.

**Commit:** Process change, no code commit

---

## INC — GOOGLE_OAUTH_CLIENT_SECRET leaked via PowerShell output paste

**Date:** 2026-06-05

**What broke:** During `.env.local` cleanup, Zubia ran a Get-Content command to check file contents and pasted the output back to chat for verification. The output included GOOGLE_OAUTH_CLIENT_SECRET in plaintext.

**Root cause:** Reflexive paste-output-for-verification pattern. The contents of `.env.local` include secrets by definition. Pasting any output from that file exposes those secrets.

**Fix applied:**

1. Rotated GOOGLE_OAUTH_CLIENT_SECRET in Google Cloud Console (generated new secret, updated Netlify env var, updated `.env.local`, revoked old secret)
2. Added rule to CLAUDE.md: "Never paste `.env.local` contents or PowerShell output that may contain secrets to chat. Use Measure-Object or Select-String for verification without exposing values."

**Prevention rule:** When verifying env files, use commands that don't print values:

- `Get-Content .env.local | Measure-Object -Line` (count check)
- `Get-Content .env.local | Select-String "KEY_NAME"` (presence check — also exposes value if grep matches the line, use carefully)

For value verification without exposure, run the test that uses the secret (e.g., crypto round-trip test) and report pass/fail only.

**Commit:** N/A (operational fix)

---

## INC — .env.local corrupted with placeholder text "YOUR_64_CHAR_HEX_KEY_HERE"

**Date:** 2026-06-05

**What broke:** Zubia ran Add-Content command with the literal placeholder text from instructions instead of substituting her actual key value. Result: `TOKEN_ENCRYPTION_KEY=YOUR_64_CHAR_HEX_KEY_HERE` got written to `.env.local`. Compounded by missing newline that mashed the new entry into the previous GOOGLE_OAUTH_CLIENT_SECRET line.

**Root cause:** Communication failure. Instruction said "replace YOUR_64_CHAR_HEX_KEY_HERE with your actual saved key" but the user, under time pressure, pasted the command verbatim.

**Fix applied:** Manual Notepad cleanup of `.env.local`, separating mashed variables onto their own lines, removing the placeholder line, adding the actual key value.

**Prevention rule:** Never provide commands with placeholder text that requires user substitution. Either:

a) Have Cursor generate the value (subject to "no secrets in chat" rule)

b) Provide the command with explicit "PASTE YOUR ACTUAL KEY HERE — do not paste this literal text" warning in capitals

c) Walk the user through a generation step that captures the value directly into the file:

`$key = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

`Add-Content -Path .env.local -Value "TOKEN_ENCRYPTION_KEY=$key"`

**Commit:** N/A (file cleanup)

---

## INC-12

**Date:** 2026-06-07

**What broke:** Zubia pasted Step 9 instructions into the Dr-Raj_Intel Cursor session by accident. Dr Raj Intel reported back about HR keyword scan results (CDP verification, 237 HR articles) instead of AgentPulse work.

**Root cause:** Two Cursor windows open; no workspace identification check before pasting a long prompt.

**Fix applied:** Caught when response content was clearly the wrong project. Prompt redirected to correct AgentPulse window.

**Prevention rule:** Glance at Cursor sidebar workspace name before pasting any prompt. Confirm `pwd` in Step 1 of every session.

**Commit:** N/A

---

## INC-13

**Date:** 2026-06-07

**What broke:** Cursor applied `meeting_notes` migration via `supabase db push` in the same turn it wrote the SQL, despite prompt requiring show-SQL-first approval.

**Root cause:** Approval gate language in prompt was not enforced by agent; agent treated "proceed with Step 2" as permission to apply immediately.

**Fix applied:** User caught the skip. Subsequent `research_briefs` migration held until explicit "approve migration." Schema verified after apply.

**Prevention rule:** Prompts must say "show SQL FIRST, do NOT run db push until approve migration." Agent must stop after showing SQL.

**Commit:** N/A (migration applied; code in 47a28e8)

---

## INC-14

**Date:** 2026-06-07

**What broke:** Zubia could not tell if Morning Brief showed production or localhost. Production still displayed "Today's Calendar" (Phase 7a) while localhost had "This Week's Calendar" (Phase 7a-extended uncommitted). Significant time spent diagnosing "code not deployed" when cause was browser tab / URL confusion.

**Root cause:** Same site appearance across tabs; uncommitted local changes vs deployed commit `6a1bc14`; no habit of checking address bar first.

**Fix applied:** Disk and dev-server curl confirmed week-view code present locally. Production updated after `47a28e8` push. Diagnostic protocol: ask "what URL is in your address bar?" first.

**Prevention rule:** Every UI verification starts with confirming the URL (`localhost:8888` vs `agentpulseweb.netlify.app`) and hard refresh before troubleshooting missing features.

**Commit:** 47a28e8 (production fix)

---

## INC-15

**Date:** 2026-06-07

**What broke:** Local `scripts/test-google-token-refresh.ts` failed with `invalid_client`. Production OAuth and calendar worked.

**Root cause:** `.env.local` `GOOGLE_OAUTH_CLIENT_SECRET` stale after 2026-06-05 rotation. Netlify had the new secret; local did not.

**Fix applied:** Skipped local refresh test; verified token path in production during Phase 7a live UI test.

**Prevention rule:** On OAuth secret rotation, update Netlify AND `.env.local` in the same session, then run local refresh test immediately to confirm sync.

**Commit:** N/A

---

## INC-16

**Date:** 2026-06-07

**What broke:** Zubia hit "Invalid credentials" multiple times, requiring Supabase magic link recovery from admin panel each time.

**Root cause:** AgentPulse has no Forgot Password UI. Password mistype or drift has no self-service recovery path in the app.

**Fix applied:** Magic link from Supabase Authentication → Users → Send magic link. Session restored manually each time.

**Prevention rule:** Build Forgot Password flow before Jason's Tuesday demo. Production-blocking for a non-technical user who will not use Supabase admin.

**Commit:** N/A (open item)

---

## INC — Truncated WEBSITE_NETLIFY_SITE_ID caused 165 failed poller runs

**Date:** 2026-06-11 through 2026-06-13

**What broke:** Phase 6 poller logged `poll_started` then `poll_failed` on every invocation for 48+ hours. Zero website lead submissions imported.

**Root cause:** `WEBSITE_NETLIFY_SITE_ID` env var in agentpulseweb Netlify project was 35 characters instead of 36 — missing final `b`. Function logs showed truncated UUID.

**Fix applied:** Copied correct Site ID from thesuepattigroup-ai project dashboard. Pasted into Notepad to verify 36 chars. Updated agentpulseweb env var. Triggered Clear cache and deploy site to force function rebuild with new value.

**Prevention rule:** Verify env var character length in Notepad after any paste. UUID values must be exactly 36 chars with 4 hyphens.

**Commit:** N/A (env var fix only, no code commit)

---

## INC — GA4_PROPERTY_ID stored as 20 chars instead of 9

**Date:** 2026-06-13

**What broke:** Market Intel showed `scope_insufficient` error in production despite OAuth token having `analytics.readonly` scope.

**Root cause:** `GA4_PROPERTY_ID` was 20 characters in Netlify production env when expected 9 digits. Likely extra whitespace or prefix on paste. GA4 Data API rejected the malformed property identifier.

**Fix applied:** Edited env var in Netlify UI, used Ctrl+A → Delete on the field, TYPED the 9 digits manually (537057869), saved, triggered redeploy.

**Prevention rule:** For env vars with known length (UUIDs, numeric IDs), always verify length after save. Type sensitive short values rather than paste.

**Commit:** N/A (env var fix only)

---

## INC — Cursor diagnostic skipped checks instead of running all five

**Date:** 2026-06-13

**What broke:** Diagnostic prompt asked for 5 specific checks; Cursor answered only check #4 and skipped the rest, then drew a conclusion that contradicted other available evidence.

**Root cause:** Long diagnostic prompts with multiple parallel checks can cause Cursor to short-circuit at first answer rather than completing all items.

**Fix applied:** Sent follow-up prompt explicitly listing the missing checks and saying "do not skip. Run all 5."

**Prevention rule:** For multi-part diagnostics, ask Cursor to confirm completion of each check in its response. Number the checks explicitly and require a status per check.

**Commit:** N/A (process fix)

---

## INC — GA4 Lead Conversion Rate calculation used wrong data source

**Date:** 2026-06-13

**What broke:** Market Intel showed 0.0% Lead Conversion Rate even though Phase 6 poller had imported a real seller-valuation lead.

**Root cause:** Calculation queried GA4 for `eventName='generate_lead'` eventCount. Website's GA4 event either wasn't firing or wasn't being received. Real lead data lived in Supabase `website_lead_submissions` table.

**Fix applied:** Replaced GA4 eventCount query with Supabase count query on `website_lead_submissions` filtered by `status='imported'` AND `netlify_form_name IN ('chatbot-lead', 'seller-valuation')`. Newsletter signups excluded. Cache wiped after deploy.

**Prevention rule:** Prefer server-side truth (database) over client-side telemetry (GA4 events) for business-critical metrics when both exist.

**Commit:** 711bc83

---

## INC — Service account JSON key creation blocked by org policy

**Date:** 2026-06-13

**What broke:** Step 2 of GA4 integration attempted to create service account JSON key. Google Cloud rejected with error `iam.managed.disableServiceAccountKeyCreation`.

**Root cause:** Organization-level security policy disabled service account key creation. This is Google's "Secure by Default" enforcement from 2026.

**Fix applied:** Pivoted entire architecture to OAuth flow instead of service account. Added `analytics.readonly` scope to existing OAuth configuration. Required user reconnect to grant new scope.

**Prevention rule:** For any new GCP service account work, check org policy constraints FIRST before designing the architecture.

**Commit:** 1b9e7bf (analytics scope addition)

---

## INC — GA4 dimension names required three fix cycles

**Date:** 2026-06-18

**What broke:** Market Intel showed "Could not load metrics" after Phase C deploy. Three separate deploy-fix-deploy cycles were needed to resolve.

**Root cause:** GA4 Data API requires `customEvent:` prefix for custom event dimensions. Additionally the API uses the event parameter name not the dimension display name. Both facts were unknown at build time.

**Fix applied:** Changed dimension names to `customEvent:referrer_domain` and `customEvent:utm_source` in the 4th `runReport` call. Commit `10df2c2`.

**Prevention rule:** Before writing any GA4 Data API query for custom dimensions, open GA4 Admin → Custom definitions and read the exact event parameter name. Use that value with `customEvent:` prefix. Test in GA4 Explorer before coding.

**Commit:** 10df2c2

---

## INC — Netlify deploy showed Published but served old code

**Date:** 2026-06-18

**What broke:** Commit `10df2c2` was local and showed in `git log` but Netlify was serving `b99d58b`. Market Intel continued failing despite believing the fix was live.

**Root cause:** `git push` was not run after the commit. Netlify auto-deploy only triggers on push to remote, not on local commit.

**Fix applied:** Ran `git push origin main` explicitly. Confirmed remote hash matched before testing.

**Prevention rule:** After every commit, immediately run `git log --oneline -3` AND check Netlify deploy hash matches before testing production. Never assume auto-deploy fired.

**Commit:** 10df2c2

---

## INC — Error logging swallowed GA4 error message

**Date:** 2026-06-18

**What broke:** First two GA4 failures showed only generic `internal_error` in logs with no detail. Could not diagnose without seeing GA4 error text.

**Root cause:** Catch block logged `reason: unexpected` but did not log `err.message`. GA4 returns detailed `INVALID_ARGUMENT` messages that were being discarded.

**Fix applied:** Added `message` field to `safeLog` call in catch block. Commit `0ad33f8`.

**Prevention rule:** Every catch block that calls `safeLog` must include the raw error message. `err instanceof Error ? err.message : String(err)` is the pattern.

**Commit:** 0ad33f8

---

## INC — Stages Advanced metric inflated by rescore

**Date:** 2026-06-25

**What broke:** Market Intel showed 808 stages advanced this week. Actual manual stage changes were far fewer.

**Root cause:** Rescore script updated `updated_at` on 739 leads. `stages_advanced` query counts any lead where `updated_at` changed this week and stage is not `new`/`inactive`/`dead`.

**Fix applied:** None yet. Known limitation documented.

**Prevention rule:** Before using `updated_at` as a proxy for user action, verify no batch operations ran that week. Add stage history table to track actual stage changes.

**Commit:** N/A

---

## INC — Deals Closed showing 7 from CSV import

**Date:** 2026-06-25

**What broke:** Market Intel showed 7 deals closed this week. These are historical CSV import leads not new closings.

**Root cause:** Same as `stages_advanced` — rescore updated `updated_at` on all leads including the 7 that had `pipeline_stage = closed` from the original import.

**Fix applied:** None yet. Flag to Jason.

**Prevention rule:** Closed deals metric should filter by when `pipeline_stage` was SET to closed, not when `updated_at` changed.

**Commit:** N/A

---

## INC — Source breakdown unsellable, raw DB values shown to client

**Date:** 2026-06-25

**What broke:** Market Intel showed Realtor full: 27, Realtor contacts: 5, Realtor Connections Plus: 3 as separate pie slices. Not presentable to Jason's prospects.

**Root cause:** `getSourceBreakdown()` queried raw source column values directly with no consolidation layer applied, despite `getSourceLabel()` already existing in `leadSources.ts` for this exact purpose.

**Fix applied:** Built `getSourcePerformance()` with proper source grouping and conversion metrics. Commit `66f48ff`.

**Prevention rule:** Before building any new display of lead data, check whether a display-layer helper already exists (`getSourceLabel`, `getStageLabel`, `getEffectiveStatus`) before querying raw values.

**Commit:** 66f48ff

---

## INC — Pipeline stage chart showed outdated labels

**Date:** 2026-06-25

**What broke:** Stage distribution chart on Market Intel showed Contacted, Attempted, Nurture instead of Jason's renamed stages.

**Root cause:** `MarketIntel.tsx` had a local `STAGE_LABELS` constant created before the June 19 stage rename. It was never updated when `pipelineStages.ts` was created as the single source of truth.

**Fix applied:** Removed local constant, imported `getStageLabel()` from `pipelineStages.ts`. Commit `d838b33`.

**Prevention rule:** When a single source of truth file is created (`pipelineStages.ts`, `leadSources.ts`), search the codebase for any existing duplicate logic that should be migrated to it.

**Commit:** d838b33
