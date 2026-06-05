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

---

## RUN — Supabase URL Configuration setup

**Task:** Configure Site URL and Redirect URLs in Supabase Auth for proper redirect handling.

**Trigger:** After creating a new Supabase project, OR if login is failing with redirect issues (localhost refused, magic link goes to wrong domain).

**Steps:**

1. Go to Supabase dashboard, open the project.
2. Authentication → URL Configuration.
3. Site URL: enter the full production URL with https://. Example: https://agentpulseweb.netlify.app
4. Click Save changes.
5. Under Redirect URLs, click Add URL.
6. Add: https://[your-domain]/** (the /** wildcard covers all paths).
7. Click Save.
8. Wait 30 seconds for Supabase to apply.
9. Test by triggering password recovery email. Email should now redirect to your production URL, not localhost.

**Expected output:** Login works, magic links resolve to production domain, password reset emails contain working links.

**Watch out for:** Site URL is often empty by default when a project is created via SDK or CLI rather than via the dashboard wizard. This is a silent failure: login appears to work as long as you have an active session token, but breaks the moment fresh authentication is needed.

---

## RUN — Magic link emergency login when password fails

**Task:** Log into a Supabase-backed app when password sign-in is failing for any reason.

**Trigger:** User cannot log in with known-good credentials. Either "Invalid credentials" error or redirect-broken password recovery.

**Steps:**

1. Supabase dashboard → Authentication → Users.
2. Click on the failing user's row to open user details.
3. Find "Send magic link" option in the panel.
4. Click Send magic link.
5. Check email inbox for the magic link email.
6. Click the link. It should redirect to the production app and log in directly without password.
7. Once logged in, use the in-app password change OR Supabase dashboard "Send password recovery" to set a fresh password.

**Expected output:** User is logged into the app via session token set by magic link, bypassing password validation.

**Watch out for:** Magic link will fail if Site URL is misconfigured (will redirect to localhost). Fix Site URL first.

---

## RUN — Production deploy rollback via Netlify

**Task:** Restore the previous good deploy when current deploy has broken something on the live site.

**Trigger:** Live site shows error, broken behavior, or failed login after a recent deploy.

**Steps:**

1. Go to https://app.netlify.com.
2. Open the affected site (e.g., agentpulseweb).
3. Click "Deploys" in the top nav.
4. Find the most recent deploy that was working (usually one row above the broken one).
5. Click on that row to open deploy details.
6. Click "Publish deploy" (or "Restore this deploy").
7. Confirm the action.
8. Wait ~30 seconds for the deploy to propagate.
9. Hard refresh the live site (Ctrl+Shift+R) to verify.

**Expected output:** Live site returns to the prior working state. Code on main is unchanged.

**Watch out for:** This is a deploy-level rollback, not a code rollback. Future deploys (auto or manual) will re-deploy the problematic commit unless code is also fixed. After rollback, either fix the code on main or hold further deploys until fix is ready.

---

## RUN — Verify seeded database content matches expected source

**Task:** Confirm that seeded text in the database is the exact text intended, not a paraphrase or fabrication.

**Trigger:** After any seed script runs that populated content meant to represent a real person's voice, knowledge, or domain content.

**Steps:**

1. Supabase dashboard → Table Editor → relevant table.
2. Open the seeded row.
3. Pick a distinctive answer or field with known-expected text.
4. Click the cell to expand the value.
5. Read the first sentence and compare to expected source.
6. Verify exact match: not a paraphrase, not "improved" wording.
7. If mismatch detected, STOP. Do not proceed with deploy.
8. Re-seed with verified source content using a copy-only Cursor prompt.

**Expected output:** Database content matches source exactly.

**Watch out for:** AI-generated content often "improves" awkward phrasing, adds generic professional language, or fabricates specifics. The smoothest, most polished version is often the fabricated one. Original human voice is often less polished and more specific. If a sentence reads "smooth" and "professional," suspect fabrication.
