# Phase 6 Part 1 — Website webhook configuration

Configure outgoing webhooks on the **thesuepattigroup.ai** Netlify site so form submissions create leads in AgentPulse Supabase in real time.

**AgentPulse endpoint (live):** `https://agentpulseweb.netlify.app/api/website-lead`

Use **copy-paste** for every value. Do not type the webhook secret by hand.

---

## Shared settings (all three forms)

| Setting | Value |
|--------|--------|
| **Webhook URL** | `https://agentpulseweb.netlify.app/api/website-lead` |
| **HTTP method** | `POST` |
| **JWS secret token (optional)** | Paste from password manager entry **"AgentPulse WEBHOOK_SECRET"** |

Netlify’s outgoing webhook UI uses **JWS signing**, not custom headers. When you enter the JWS secret on each form notification, Netlify signs each POST with an `X-Webhook-Signature` JWT (HS256). AgentPulse verifies that token against the same `WEBHOOK_SECRET` env var.

The secret must be **identical** in:

- **agentpulseweb** Netlify env (`WEBHOOK_SECRET`) — used to verify incoming JWTs
- **thesuepattigroup** form webhook **JWS secret token** field (same UUID)
- Your local `AgentPulse_Jason_Web/.env.local` (`WEBHOOK_SECRET=`)

If the JWS secret does not match, AgentPulse returns **401 Unauthorized**.

**Never** commit the secret to git or paste it into chat.

### How AgentPulse verifies the signature

Per [Netlify deploy/webhook docs](https://docs.netlify.com/site-deploys/deploy-notifications/#payload-signature) (same JWS scheme for form outgoing webhooks):

1. Read header **`X-Webhook-Signature`** (JWT).
2. Verify JWT with `WEBHOOK_SECRET`, algorithm **HS256**, issuer **`netlify`**.
3. Confirm JWT claim **`sha256`** equals SHA-256 hex digest of the **raw POST body**.
4. Confirm JWT claim **`iat`** is present and not older than **5 minutes** (replay protection).

---

## Where to configure in Netlify

1. Open https://app.netlify.com
2. Select the **thesuepattigroup** site (thesuepattigroup.ai).
3. Go to **Site configuration** → **Forms** → **Form submission notifications** (or **Emails and webhooks**).
4. For each form below, add an **Outgoing webhook** on **Form submission**.
5. Set **URL** and **JWS secret token (optional)** as in the table above. Netlify generates `X-Webhook-Signature` automatically; you do not add custom headers.

---

## Form 1 — `chatbot-lead`

| Field | Value |
|--------|--------|
| **Form name** | `chatbot-lead` |
| **Event** | Form submission |
| **URL** | `https://agentpulseweb.netlify.app/api/website-lead` |
| **JWS secret token** | Same UUID as **AgentPulse WEBHOOK_SECRET** |

**Website fields posted (reference):** `name`, `email`, `phone`, `budget`, `area`, `beds`, `pre_approved`, `timeline`, `timestamp`, plus scoring metadata.

**AgentPulse mapping:**

- `source` = `website_chatbot`
- `pipeline_stage` = `new`
- `budget` → `budget_max` (numeric)
- `area`, `beds`, `pre_approved`, `timeline` — not stored until Phase 5 `purpose` column

---

## Form 2 — `seller-valuation`

| Field | Value |
|--------|--------|
| **Form name** | `seller-valuation` |
| **Event** | Form submission |
| **URL** | `https://agentpulseweb.netlify.app/api/website-lead` |
| **JWS secret token** | Same UUID as **AgentPulse WEBHOOK_SECRET** |

**Website fields posted (reference):** `name`, `email`, `phone`, `property_address`, `zip`, `city`, `beds`, `sqft`, `timeline`.

**AgentPulse mapping:**

- `source` = `website_valuation`
- `pipeline_stage` = `new`
- `has_home_to_sell` = `true`
- `property_address` → `address`
- `city`, `beds`, `sqft`, `timeline` — not stored in Part 1

---

## Form 3 — `newsletter-signup`

| Field | Value |
|--------|--------|
| **Form name** | `newsletter-signup` |
| **Event** | Form submission |
| **URL** | `https://agentpulseweb.netlify.app/api/website-lead` |
| **JWS secret token** | Same UUID as **AgentPulse WEBHOOK_SECRET** |

**Website fields posted (reference):** `email`

**AgentPulse mapping:**

- `source` = `website_newsletter`
- `pipeline_stage` = `new` (intent carried by `source`, not a separate stage)

---

## After all three webhooks are saved

1. Submit one real test on production https://thesuepattigroup.ai per form (or one test each).
2. In **Supabase** → Table Editor → `leads`, confirm new rows with the correct `source` tags.
3. In **AgentPulse** → **Morning Brief**, confirm new leads appear on refresh (score-sorted worklist).
4. If nothing appears:
   - Check **agentpulseweb** Netlify **Functions** logs for `website-lead`
   - **401** = JWS secret mismatch, invalid signature, stale `iat`, or body hash mismatch
   - **500** = payload shape issue (check `form_name` and `data` in webhook body)

---

## Optional smoke test (signed POST)

Netlify signs webhooks for you in production. For a manual signed test without curl JWT math, from the AgentPulse repo (with `WEBHOOK_SECRET` in `.env.local`):

```bash
npx tsx scripts/test-website-lead-jws.ts --live
```

That script signs payloads like Netlify (iss `netlify`, `sha256` of body, fresh `iat`), POSTs to the live URL, verifies Supabase rows, and deletes `@test.agentpulse.local` test data.

**Expected:** all tests PASS, including three form types returning HTTP `200`.

---

## Not in scope for Part 1

- Parallel email to Jason on each submission (separate Phase 6 work)
- Gmail / Google Calendar integration
- Storing chatbot `area` / `timeline` (Phase 5: `purpose` column on `leads`)
- Configuring webhooks from the AgentPulse repo (manual step on the **website** Netlify site)

---

## Related repo files

| File | Purpose |
|------|---------|
| `netlify/functions/website-lead.ts` | Webhook handler, JWS verify, mappers |
| `netlify.toml` | Functions path + `/api/website-lead` redirect |
| `phase6_env_setup_checklist.txt` | Env var setup (gitignored, local only) |
