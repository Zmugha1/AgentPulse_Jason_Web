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
