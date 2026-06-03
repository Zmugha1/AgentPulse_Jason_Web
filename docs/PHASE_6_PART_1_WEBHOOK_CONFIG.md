# Phase 6 Part 1 — Website webhook configuration

Configure outgoing webhooks on the **thesuepattigroup.ai** Netlify site so form submissions create leads in AgentPulse Supabase in real time.

**AgentPulse endpoint (live):** `https://agentpulseweb.netlify.app/api/website-lead`  
**Deployed with:** commit `4cdd50c` and later on `main`

Use **copy-paste** for every value. Do not type the webhook secret by hand.

---

## Shared settings (all three forms)

| Setting | Value |
|--------|--------|
| **Webhook URL** | `https://agentpulseweb.netlify.app/api/website-lead` |
| **HTTP method** | `POST` |
| **Custom header name** | `x-webhook-secret` |
| **Custom header value** | Paste from password manager entry **"AgentPulse WEBHOOK_SECRET"** |

The secret must be **identical** on:

- **agentpulseweb** Netlify env (`WEBHOOK_SECRET`)
- **thesuepattigroup** Netlify env (`WEBHOOK_SECRET`)
- Your local `AgentPulse_Jason_Web/.env.local` (`WEBHOOK_SECRET=`)

If the header value does not match, AgentPulse returns **401 Unauthorized**.

**Never** commit the secret to git or paste it into chat.

---

## Where to configure in Netlify

1. Open https://app.netlify.com
2. Select the **thesuepattigroup** site (thesuepattigroup.ai).
3. Go to **Site configuration** → **Forms** (or **Forms** → notifications / outgoing webhooks).
4. For each form below, add an **Outgoing webhook** (or **Webhook notification**) on **Form submission**.

---

## Form 1 — `chatbot-lead`

| Field | Value |
|--------|--------|
| **Form name** | `chatbot-lead` |
| **Event** | Form submission |
| **URL** | `https://agentpulseweb.netlify.app/api/website-lead` |
| **Header** | `x-webhook-secret: <from password manager>` |

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
| **Header** | `x-webhook-secret: <from password manager>` |

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
| **Header** | `x-webhook-secret: <from password manager>` |

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
   - **401** = secret mismatch between sites
   - **500** = payload shape issue (check `form_name` and `data` in webhook body)

---

## Optional smoke test (curl)

Run from a shell where `WEBHOOK_SECRET` is set (e.g. exported from `.env.local`). Do not paste the secret into commands logged in chat.

```bash
curl -X POST "https://agentpulseweb.netlify.app/api/website-lead" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"form_name":"newsletter-signup","created_at":"2026-06-06T12:00:00.000Z","data":{"email":"smoke-test@example.com"}}'
```

**Expected:** HTTP `200` and JSON like `{"ok":true,"id":"<uuid>","source":"website_newsletter"}`.

Delete any smoke-test rows in Supabase if you use a real-looking email.

---

## Not in scope for Part 1

- Parallel email to Jason on each submission (separate Phase 6 work)
- Gmail / Google Calendar integration
- Storing chatbot `area` / `timeline` (Phase 5: `purpose` column on `leads`)
- Configuring webhooks from the AgentPulse repo (this is a manual step on the **website** Netlify site)

---

## Related repo files

| File | Purpose |
|------|---------|
| `netlify/functions/website-lead.ts` | Webhook handler + mappers |
| `netlify.toml` | Functions path + `/api/website-lead` redirect |
| `phase6_env_setup_checklist.txt` | Env var setup (gitignored, local only) |
