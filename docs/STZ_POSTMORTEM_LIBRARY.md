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
