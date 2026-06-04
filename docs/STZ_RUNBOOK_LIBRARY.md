# STZ Runbook Library

---

## RUN — Configure Netlify Forms outgoing webhook

**Task:** Wire a Netlify Forms site to send POST notifications to an external function URL.

**Trigger:** When website forms need to feed AgentPulse (or any external service) with JWS-signed payloads.

**Steps:**

1. Generate UUID for webhook secret. Save to password manager.
2. Add WEBHOOK_SECRET env var with the UUID to BOTH the receiving site's Netlify env vars AND the source site's Netlify env vars.
3. Source site Netlify dashboard: Site configuration → Notifications → Emails and webhooks → Form submission notifications.
4. Click "Add notification" → "HTTP POST request".
5. URL: the receiving function's full URL.
6. JWS secret token: paste the UUID from password manager.
7. Form: "Any form" (or specific form name if scoping).
8. Save.
9. Submit a real form on the source site as test.
10. Verify row appears in destination database within 30 seconds.
11. Delete test row.

**Expected output:** One webhook listed under Form submission notifications. Real form submissions land in destination database within seconds.

**Watch out for:** Webhook auto-disabled after 6 consecutive 4xx failures. Re-enable via Options → Edit → Save. JWS secret must be identical on both sides of the wire.

---

## RUN — Debug failing Netlify Forms webhook

**Task:** Diagnose why incoming webhook requests are returning 4xx/5xx.

**Trigger:** Webhook configured, requests visible in source site logs, but rows not appearing in destination database. Or destination function logs show failures.

**Steps:**

1. Receiving site Netlify dashboard: Logs & metrics → Functions → pick the function.
2. Look for log lines with auth_fail reason= identifiers.
3. Match reason to known causes:
   - missing_signature_header: source site not signing payloads. JWS secret field empty in source UI, or webhook not actually configured.
   - jwt_verify_failed: secret mismatch between source UI and destination env var.
   - wrong_issuer: source service is not Netlify (or Netlify changed their iss claim). Check Netlify docs.
   - hash_mismatch: receiving function is not hashing raw body correctly. Check that body is read before JSON.parse.
   - missing_sha256_claim: Netlify changed JWT structure. Re-check docs.
4. Apply fix. Redeploy if code change.
5. Re-enable disabled webhook in source site UI.
6. Retry with real form submission.

**Expected output:** 200 status code, row in destination database.

**Watch out for:** Hard-refresh browser to bypass cache when testing UI changes from the same deploy.

---

## RUN — Inline-edit a lead field on Lead Intelligence

**Task:** Set or update a custom field (purpose, etc) on an existing lead.

**Trigger:** Manual data entry when receiving lead context from offline source (phone call, meeting, email outside the system).

**Steps:**

1. Navigate to Lead Intelligence tab.
2. Search by lead name in the search box.
3. Click the field's display text (e.g., "Purpose: not set").
4. Type the value in the inline textarea.
5. Click outside the textarea (save on blur) or press Enter.
6. Verify "Saving..." flashes then displays the saved value.
7. Hard refresh to confirm persistence.

**Expected output:** Field shows new value, persists across page reloads.

**Watch out for:** Pressing Escape cancels without saving. Don't press Escape after typing if you want to keep the value.
