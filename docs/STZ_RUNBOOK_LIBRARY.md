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

---

## RUN — Connect or disconnect Google Account on Integrations

**Task:** Link or unlink Gmail + Calendar read-only access via Google OAuth on the Integrations page.

**Trigger:** User wants AgentPulse to store encrypted OAuth tokens for future Gmail/Calendar features (Phase 7+).

**Steps (Connect):**

1. Sign in to https://agentpulseweb.netlify.app.
2. Sidebar → Integrations.
3. Google card should show **Not connected** and an enabled **Connect Google Account** button.
4. Click **Connect Google Account**.
5. Browser redirects to Google consent (AgentPulse, Gmail read, Calendar read, profile, email).
6. Approve with the intended Google account (must be a configured OAuth test user until app is published).
7. Browser returns to `/integrations?status=connected`.
8. Card shows green checkmark, connected Google email, date, permissions, **Disconnect** button.
9. Optional: Supabase Table Editor → google_oauth_tokens — one row; refresh_token_encrypted must not start with `1//` or `ya29.`

**Steps (Disconnect):**

1. On Integrations, click **Disconnect** on the Google card.
2. Card returns to **Not connected** with **Connect Google Account**.
3. Optional: google_oauth_tokens row for that user_email should be deleted.

**Expected output:** Encrypted token row exists after connect; zero rows after disconnect. No Gmail/Calendar data is read in Phase 6 Part 3 — connection only.

**Watch out for:** TOKEN_ENCRYPTION_KEY and GOOGLE_OAUTH_* must be set in Netlify Functions runtime. OAuth state expires in 10 minutes — if user delays on Google consent, retry Connect. Use incognito + hard refresh when testing live after deploy.

---

## RUN — Generate and store a new encryption key

**Task:** Create a new secret key (encryption key, API key, signing key) and store it in both Netlify and local `.env.local` without exposing the value to chat or version control.

**Trigger:** When a new symmetric encryption key, signing secret, or similar value is needed for a build.

**Steps:**

1. Generate the key in PowerShell directly, without echoing to chat:

   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

   The 64-char hex string appears in your terminal. DO NOT copy it to Claude or Cursor chat.

2. Save the key to your password manager (e.g., 1Password, Bitwarden) with a descriptive label like "AgentPulse TOKEN_ENCRYPTION_KEY".

3. Copy from password manager when needed for the next two steps.

4. Add to Netlify:

   Site → Configuration → Environment variables → Add a variable

   Key: descriptive name (e.g., TOKEN_ENCRYPTION_KEY)

   Value: paste from password manager

   Mark as Secret: yes

   Scopes: Builds, Functions, Runtime (or All scopes for non-runtime secrets)

   Same value for all deploy contexts

   Save.

5. Add to `.env.local` using direct write:

   `Add-Content -Path .env.local -Value "TOKEN_ENCRYPTION_KEY=<paste actual value>"`

   Verify line count: `Get-Content .env.local | Measure-Object -Line`

   Should show expected total line count for your env file.

6. Run a quick test that exercises the secret without printing it:

   If it's an encryption key, run a round-trip test (encrypt then decrypt a known string, verify match).

   If it's an API key, make a minimal API call that requires the key.

**Expected output:** Secret available to both production and local development. No traces in chat history, git history, or screenshots.

**Watch out for:**

- Don't paste the secret to chat for verification — use a test that doesn't print the value
- Don't use placeholder text like "YOUR_KEY_HERE" in commands — the literal placeholder gets written
- Don't run Get-Content `.env.local` then paste the full output for "verification" — that exposes every secret in the file

---

## RUN — Rotate a leaked OAuth client secret

**Task:** Replace a Google OAuth Client Secret that has been exposed.

**Trigger:** Client secret appears in chat, screenshot, public repo, or any other unintended location.

**Steps:**

1. Open https://console.cloud.google.com/apis/credentials?project=YOUR_PROJECT
2. Click on the affected OAuth 2.0 Client ID (e.g., "AgentPulse Web Client")
3. Find "Client secrets" section in the client details
4. Click "Add secret" to generate a new one (Google now supports multiple active secrets per client for zero-downtime rotation)
5. Copy the new secret immediately. Save to password manager.
6. Update Netlify env var GOOGLE_OAUTH_CLIENT_SECRET with the new value
7. Update `.env.local` with the new value
8. Verify OAuth flow still works (run a Connect/Disconnect cycle)
9. Return to Google Cloud, disable or delete the OLD secret
10. Confirm Netlify production deployment picks up the new secret (may require triggering a redeploy)

**Expected output:** OAuth continues working with the new secret. Old leaked secret no longer authenticates.

**Watch out for:**

- Don't delete the old secret until the new one is verified working
- Some Google client configurations have a one-secret-only setting; in that case "Reset Secret" replaces immediately and there's a brief window where existing sessions may need re-authentication
- The new secret needs to propagate to Netlify and trigger a rebuild before production picks it up

---

## RUN — Diagnose login failure on Supabase-backed app

**Task:** Systematic diagnosis when login starts failing for a Supabase-authenticated app.

**Trigger:** User reports "Invalid credentials" or "No API key found" errors after login attempt.

**Steps:**

1. Confirm the user exists in Supabase Authentication → Users
   - Note the "Last signed in" timestamp
   - Note the "Confirmed at" status
2. Try login in incognito window with hard refresh (Ctrl+Shift+R)
   - Rules out browser cache and stale session tokens
3. Open browser DevTools → Network tab → attempt login
   - Look for the request to `auth/v1/token?grant_type=password`
   - Note the HTTP status code and response body
4. Interpret the response:
   - 400 "No API key found in request" → Supabase client lacks apikey header. Check Site URL configuration in Authentication → URL Configuration (must be set to production URL with https://, not empty). Add production URL to Redirect URLs allowlist with `/**` wildcard.
   - 400 "Invalid login credentials" → Password mismatch or user not confirmed. Try magic link from Supabase user details panel.
   - Failed to load resource entirely → Network issue or Supabase project paused/deleted.
5. If Site URL was empty, set it to the production URL (e.g., https://agentpulseweb.netlify.app) and save. Wait 30 seconds.
6. Test login again in fresh incognito.
7. If still failing, use magic link from Supabase user details to log in directly, then set a new password from within the authenticated session.

**Expected output:** User can log in successfully.

**Watch out for:**

- Session tokens persist across browser sessions, so old success may mask new failures until logout/incognito
- The "Invalid credentials" error is misleading when the actual issue is missing Site URL — Supabase reports the symptom, not the root cause

---

## RUN-12 — Enable Google API in GCP project for new OAuth scope

**Task:** Enable a Google Cloud API when OAuth Connect succeeds but the first API call returns 403 `scope_insufficient`.

**Trigger:** Connected Google account, scopes granted in DB, but Calendar (or other) API returns 403 on first fetch.

**Steps:**

1. GCP Console → APIs & Services → Library.
2. Search for the specific API name (e.g., "Google Calendar API").
3. Click Enable for project `agentpulse-prod`.
4. Wait 1–2 minutes for propagation.
5. AgentPulse Integrations → Disconnect Google Account.
6. Connect Google Account again (fresh consent with API enabled).
7. Hard refresh Morning Brief (Ctrl+Shift+R).
8. Verify events load without 403.

**Expected output:** Calendar events (or target API data) return 200 with event rows.

**Watch out for:** Enabling the API alone is not enough if the user still holds a token from before enable — reconnect refreshes the grant context.

---

## RUN-13 — Magic link recovery for blocked login

**Task:** Restore access when user hits "Invalid credentials" repeatedly and has no in-app password reset.

**Trigger:** Known-good user cannot sign in with password; Forgot Password not available in AgentPulse UI.

**Steps:**

1. Supabase dashboard → Authentication → Users.
2. Find user by email.
3. Open user details → Send magic link.
4. User checks email and clicks magic link.
5. User lands on production site authenticated.
6. Optional: set new password from authenticated session if Supabase allows.

**Expected output:** User session active on https://agentpulseweb.netlify.app.

**Watch out for:** Site URL and Redirect URLs must be configured or magic link redirects to localhost.

---

## RUN-14 — Anthropic research cost monitoring

**Task:** Monitor spend from Prepare-panel Public Research (claude-sonnet-4-5 + web search).

**Trigger:** After shipping Phase 7a-extended AI research; periodic check or unexpected bill concern.

**Steps:**

1. Open https://console.anthropic.com → Plans & Billing → Usage.
2. Note daily/weekly spend trend.
3. Expect roughly $0.02–0.05 per attendee per cache miss (first Prepare open per event/attendee).
4. Reopen same event should hit `research_briefs` cache (no new Anthropic charge).
5. If spend spikes, check Netlify function logs for repeated `cache_miss` on same keys (cache layer broken).

**Expected output:** Spend proportional to unique attendee research calls, not every panel open.

**Watch out for:** Events with 5+ attendees still cap at 5 research calls per Prepare click by design.

---

## RUN-15 — Deploy Phase changes to production

**Task:** Ship a committed feature from local main to live Netlify site.

**Trigger:** Cursor reports build pass and commit hash; Zubia approves push.

**Steps:**

1. Cursor reports commit hash and file list.
2. Zubia says "approve push."
3. `git push origin main`
4. Wait 2–3 minutes for Netlify auto-deploy.
5. Confirm new bundle hash in production `index.html` (or specific UI string grep).
6. Hard refresh production (Ctrl+Shift+R).
7. Verify new feature visible (e.g., "This Week's Calendar", "Public Research").

**Expected output:** https://agentpulseweb.netlify.app serves new JS bundle; feature works end-to-end.

**Watch out for:** Browser cache and wrong tab (localhost vs production) mimic "deploy failed" — confirm URL before debugging code.

---

## RUN-16 — Password reset for user (production)

**Task:** Walk a user through self-service password reset when they cannot sign in.

**Trigger:** User reports "Invalid credentials" or forgot password.

**Steps:**

1. Direct user to https://agentpulseweb.netlify.app/login
2. User clicks "Forgot password?" link below Sign In button
3. User enters email on /forgot-password page
4. User receives email from Supabase (check spam)
5. User clicks reset link, redirects to /reset-password
6. User sets new password (min 8 chars, must match)
7. Auto-redirects to /login after success
8. User signs in with new password

**Expected output:** User logged in with new password.

**Watch out for:**

- Email landing in spam folder (Gmail Promotions tab)
- Reset link expires after a window — re-request if needed
- 3-second timeout on /reset-password if recovery session not detected (shows "expired link" UI)

---

## RUN — Verify Netlify env var actually took effect

**Task:** Confirm an updated Netlify environment variable is being used by deployed functions.

**Trigger:** After editing any env var that affects function behavior.

**Steps:**

1. Edit value in Netlify env vars UI
2. Save
3. Manually trigger Deploys → Trigger deploy → Clear cache and deploy site (env var changes don't always auto-redeploy)
4. Wait for Published status (2-3 min)
5. Manually trigger the affected function
6. Read function logs via Netlify CLI: `netlify logs --function {name}`
7. Confirm the new value appears in logs

**Expected output:** Function uses the new env var value.

**Watch out for:** Browser cache showing old behavior; auto-redeploy not always happening on env var save; values with trailing whitespace looking correct in UI but failing at runtime.

---

## RUN — Add a new OAuth scope to existing AgentPulse OAuth flow

**Task:** Add an additional Google API scope without breaking existing OAuth users.

**Trigger:** New Google API feature requires permission not in current OAuth grant.

**Steps:**

1. Add scope to `GOOGLE_OAUTH_SCOPES` array in `src/lib/googleOAuthConfig.ts`
2. Add scope in Google Cloud Console → Google Auth Platform → Data Access section
3. Commit and push (code must be live before reconnect)
4. Wait for Netlify deploy to publish
5. User disconnects Google in AgentPulse Integrations
6. User reconnects, approves new permission on consent screen
7. Verify `scopes_granted` in `google_oauth_tokens` table includes new scope

**Expected output:** `scopes_granted` array contains the new scope URL.

**Watch out for:** Reconnecting before deploy is live — user will see old consent screen; consent screen UI in 2026 calls this "Data Access" not "OAuth consent screen → Scopes".

---

## RUN — Migrate from service account to OAuth for Google API access

**Task:** Replace service account auth pattern with user OAuth when org policy blocks service account keys.

**Trigger:** Service account JSON key creation blocked by `iam.managed.disableServiceAccountKeyCreation` org policy.

**Steps:**

1. Add target API scope to OAuth configuration (`analytics.readonly` for GA4, equivalent for other APIs)
2. Update OAuth consent screen Data Access in GCP Console
3. User reconnects to grant new scope
4. In server code: use `getValidAccessToken(userEmail)` to get OAuth bearer token
5. Use that token in `Authorization: Bearer` header instead of service account credentials
6. Pre-flight check: verify `analytics.readonly` is in user's `scopes_granted` before calling target API

**Expected output:** Functions can call Google API on behalf of the connected user.

**Watch out for:** User must have Viewer-or-higher access to the target resource (GA4 property, Calendar, etc.) — OAuth grant alone is not enough.

---

## RUN — Fix corrupted env var in Netlify production

**Task:** Clear and re-set a Netlify environment variable when stored value is wrong length or contains whitespace.

**Trigger:** Function logs show env var with unexpected length or truncation.

**Steps:**

1. Netlify → agentpulseweb → Site configuration → Environment variables
2. Find the variable, click → Edit
3. Click inside the value field, press Ctrl+A to select all
4. Press Delete to clear the field completely
5. TYPE the correct value character by character (do not paste)
6. For known-length values (UUIDs, numeric IDs), verify character count visually
7. Save
8. Force redeploy via Deploys → Trigger deploy → Clear cache and deploy site
9. Wait for Published status
10. Test the affected function

**Expected output:** Function uses correct value, errors clear.

**Watch out for:** Pasting reintroduces the same whitespace/truncation; auto-deploy doesn't always trigger on env var save; functions use cached old env until next deploy.

---

## RUN — Wipe ga4_metrics_cache after metric calculation change

**Task:** Clear stale cached metric values after changing how a metric is calculated server-side.

**Trigger:** Any code change to the metric calculation logic in `fetch-website-metrics.ts`.

**Steps:**

1. Deploy the code change to production
2. Wait for Published status
3. Run: `DELETE FROM ga4_metrics_cache WHERE 1=1;`
4. Hard refresh Market Intel (Ctrl+Shift+R) in browser
5. Verify cards show new values, not stale cached zeros

**Expected output:** All users see freshly calculated metrics immediately.

**Watch out for:** Wiping before deploy is live — cache will refill with the old calculation immediately. Always deploy first, then wipe.

---

## RUN — Debug a GA4 Data API dimension error

**Task:** Identify and fix an `INVALID_ARGUMENT` error on a GA4 Data API `runReport` call.

**Trigger:** Market Intel shows "Could not load metrics" and Netlify logs show `ga4_fetch_failed`.

**Steps:**

1. Go to Netlify → Functions → `fetch-website-metrics` → Logs
2. Find the `ga4_fetch_failed` log entry
3. Read the `message` field exactly. GA4 will say "Did you mean X?" or "Field Y is not valid."
4. Go to GA4 Admin → Custom definitions
5. Find the dimension, read the User Property/Parameter column exactly
6. Update the dimension name in the code to `customEvent:[parameter name]`
7. Deploy, wipe `ga4_metrics_cache`, hard refresh

**Expected output:** Market Intel loads with real data.

**Watch out for:** Display name vs parameter name mismatch. Always use the parameter name. Always confirm the pushed commit hash matches Netlify Published hash before testing.

---

## RUN — Confirm Netlify deploy hash matches local commit

**Task:** Verify that what Netlify is serving matches what you just committed and pushed.

**Trigger:** After any push to `main` before testing production.

**Steps:**

1. Run `git log --oneline -1` to get local hash
2. Go to Netlify → Deploys
3. Confirm the Published deploy shows the same hash as step 1
4. If hashes differ, check if push actually ran
5. Run `git push origin main` if needed
6. Wait for new Published status

**Expected output:** Netlify hash matches local hash.

**Watch out for:** Netlify auto-deploy does not fire on local commit, only on push to remote. A Published status from a prior deploy can look current even when it is not.

