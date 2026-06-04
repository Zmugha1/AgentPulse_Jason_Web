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
