# AgentPulse Build Sequence — Phase 7 and beyond

Last updated: 2026-06-08
Owner: Dr. Zubia Mughal
Status: Phase 7a, 7a-extended, and password reset complete. Next: Market Intel / GA4 (2026-06-10).

## Why this file exists

Build sequence outlives any single Cursor session. When a session 
ends, the next session reads this file before starting work. 
Prevents losing roadmap across cold starts.

## Build priority (in order)

### NEXT UP — Market Intel / GA4 / Search Console integration
- Planned start: 2026-06-10 (Wednesday, post-Jason demo)
- Time: 3-4 hours (GA4) + Search Console if scoped
- Prereqs: Google Cloud service account setup (Zubia, 20 min)
- Output: Real visitor data on Market Intel page replacing 
  placeholder. Sessions, sources, pages, lead form submissions.
- Status: Queued — do not start before Jason demo (Tuesday 6/9)
- Why now: Password reset shipped. Website traffic is next deferred 
  item from prior sessions.

### URGENT — Password reset UI for Jason (before Tuesday)
- Time: 2-3 hours
- Prereqs: None
- Output: Forgot Password link on login, reset request page, reset 
  confirm page, email template wired
- Status: COMPLETE — shipped 2026-06-08 (commit a8e77d8)
- Why first: Jason has no self-service recovery if password fails. 
  Magic link via Supabase admin is not sustainable for Tuesday demo.

### Phase 7a — Calendar events in Morning Brief
- Time: 4-6 hours
- Prereqs: OAuth shipped (commit 941fc73, 2026-06-05)
- Output: Today's connected Google Calendar events shown in Morning 
  Brief with prep buttons
- Status: COMPLETE — shipped 2026-06-07 (commit 6a1bc14)
- Why first: Validates OAuth investment with immediate user-facing 
  value. Visible win for Jason on Tuesday demo.

### Phase 7a-extended — Week calendar view + Prepare panel
- Time: 6-8 hours (includes AI research)
- Prereqs: Phase 7a complete
- Output: This Week's Calendar (today + 6 days), Prepare panel with 
  lead context, meeting notes, Public Research via Anthropic web 
  search
- Status: COMPLETE — shipped 2026-06-07 (commit 47a28e8)
- Note: Phase 7d AI research brief delivered early inside Prepare 
  panel (not full email compose).

### Phase 7b — Gmail lead detection for Realtor.com and Zillow
- Time: 6-8 hours
- Prereqs: Phase 7a-extended complete (token decryption + calendar 
  flow proven in production)
- Output: AgentPulse scans connected Gmail for emails from 
  connect@realtor.com, noreply@zillow.com, etc. Auto-parses lead 
  name, contact info, property interest. Creates lead rows.
- Status: Queued
- Why second: Killer feature. Replaces CSV imports. Makes 
  Realtor.com leads land in AgentPulse within minutes of arrival.

### Phase 7c — Calendar event to lead matching
- Time: 2-3 hours
- Prereqs: Phase 7a-extended complete (week view + Prepare panel 
  shipped)
- Output: Bidirectional calendar ↔ lead linking. Prepare panel 
  already shows lead context when attendee email matches (partial). 
  Remaining: lead profile shows upcoming meetings for that lead.
- Status: Queued (partial attendee matching done in 7a-extended)
- Why third: Small follow-on to 7a-extended. High user value for 
  daily workflow.

### Phase 7d — Email composing
- Time: 4-6 hours
- Prereqs: Architecture decision required before build can start. 
  AI attendee research brief already shipped in 7a-extended Prepare 
  panel.
- Architecture decision needed:
    Option A: Add gmail.send scope to existing OAuth (1-3 week 
      Google verification timeline for restricted scope)
    Option B: SendGrid/Postmark for outbound (separate vendor, 
      from address is system-controlled, not Jason's Gmail)
    Option C: Google Apps Script trigger (complex setup, indirect 
      sending)
- Output: Compose email from a lead's profile, send via chosen path
- Status: Architecture decision pending
- Why fourth: Highest complexity. Don't rush. Decision affects 
  brand promise (is it really "from Jason" or "from AgentPulse on 
  behalf of Jason"?).

### Phase 8a — Mobile polish for Lead Intelligence
- Time: 2-3 hours
- Prereqs: None (independent of Phase 7)
- Output: Lead Intelligence table converts to card view on mobile. 
  All touch targets 44px+. Inline edit usable on touch.
- Status: Queued
- Why fifth: Can be parallelized with Phase 7 work since no 
  dependency. Matters because Jason works from his truck on phone.

### Phase 8b — GA4 integration for Market Intel Website Activity
- Time: 3-4 hours total (4 sub-steps)
- Prereqs: Google Cloud service account setup (Zubia, 20 min)
- Output: Real visitor data on Market Intel page replacing 
  placeholder. Sessions, sources, pages, lead form submissions.
- Status: Queued for 2026-06-10 (see NEXT UP at top of queue). 
  Service account not yet created.
- Why sixth: Lower urgency. Site doesn't have heavy traffic yet. 
  Useful for proving website value to Jason once it grows.

### Phase 8b detailed breakdown (Website Activity)

Step 1: GA4 service account (Zubia, 20 min in GCP Console)
  - Project: agentpulse-prod (same as OAuth)
  - IAM → Service Accounts → Create
  - Name: agentpulse-ga4-reader
  - Role: none at GCP level (permissions granted at GA4 level)
  - Create JSON key, download
  - In GA4 admin → Property → Property access management → add 
    service account email as Viewer
  - Store JSON key contents in Netlify env var GA4_SERVICE_ACCOUNT_JSON 
    (marked secret, Builds + Functions scopes only)
  - Local .env.local: same value

Step 2: Netlify function ga4-fetch.ts (Cursor, 1-2 hours)
  - Authenticates with service account JSON
  - Calls GA4 Data API: sessions, top sources, top pages, lead 
    form submissions, last 30 days
  - Returns structured JSON

Step 3: Cache layer in Supabase (Cursor, 1 hour)
  - New table ga4_cache (data jsonb, fetched_at timestamptz, 
    ttl_hours int default 24)
  - Service that returns cached data if fresh, fetches fresh if 
    stale
  - Prevents hitting GA4 API on every page load

Step 4: Market Intel UI update (Cursor, 1-2 hours)
  - Replace Website Activity placeholder with real data
  - Visitor count card, sources pie chart, top 5 pages list, lead 
    form submissions count
  - Loading state, error state, last-updated timestamp

## Suggested calendar

Sunday 6/7: Phase 7a + 7a-extended shipped
Monday 6/8: Password reset UI shipped (a8e77d8)
Tuesday 6/9: Jason demo
Wednesday 6/10: Market Intel / GA4 + Search Console (Phase 8b)
Thursday or Friday 6/12-6/13: Phase 7d (after architecture decision)
Following week: Phase 7b Gmail lead detection, Phase 7c calendar matching

## Rules carried forward from prior sessions

- No secrets in chat output (from 6/5 OAuth incident)
- Live UI verification before push, not after (from 6/3 archive incident)
- Diagnose before rollback (from 6/4 STZ rollback incident)
- Cursor must not author seed data (from 6/4 hallucination incident)
- Push only with explicit "approve push" from Zubia
- Migration files are additive, no DROP TABLE on live data
- .env.local additions via PowerShell Add-Content, verify with 
  Measure-Object, never paste contents to chat
