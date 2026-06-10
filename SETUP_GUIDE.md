# Nankana Admin Portal — Setup Guide

**Stack:** Vanilla JS (ES module) · HTML5 · CSS variables · Supabase Auth + Edge Functions  
**Lives in:** its own repo `nankana-admin-portal/` — fully isolated from `nankana-home-care` and `mediassist-pro`

---

## Repository Structure

```
nankana-admin-portal/
├── index.html                          ← Single-page admin shell
├── js/
│   └── admin.js                        ← All auth + UI logic (ES module)
├── supabase/
│   └── functions/
│       └── admin-staff/
│           └── index.ts               ← Edge Function (invite + list)
├── setup.sql                           ← Run once in Supabase SQL Editor
└── SETUP_GUIDE.md                      ← This file
```

---

## Step 1 — Run the SQL Setup

1. Open **Supabase Dashboard → SQL Editor → New Query**
2. Paste the entire contents of `setup.sql` and click **Run**
3. Confirm the final `SELECT` at the bottom returns both tables with `rls_enabled = true`

This creates:
- `appointments` table — public booking intake, used by `booking-submit.js` and `bookings.js`
- `admin_audit_log` table — append-only action trail written by the Edge Function
- Realtime enabled on `appointments` for the MediAssist Pro live feed

---

## Step 2 — Create Your Admin Account

The admin portal uses **email + password** login (not magic link).

1. **Supabase Dashboard → Authentication → Users → Add user**
2. Enter your admin email + a strong password
3. Click **Create user** (no need to send a confirmation email — it's set immediately)

> ⚠️ This is the **only** account that can log into `nankana-admin-portal`.  
> Regular staff members log into `mediassist-pro` via magic link, not this portal.

---

## Step 3 — Deploy the Edge Function

The Edge Function runs with the `service_role` key server-side so admin auth operations are never exposed to the browser.

### 3a. Install Supabase CLI (if not already)
```bash
npm install -g supabase
```

### 3b. Link your project
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
# Find YOUR_PROJECT_ID in: Supabase Dashboard → Project Settings → General
```

### 3c. Set the required secrets
```bash
# Your worker app URL (where magic links redirect staff members)
supabase secrets set WORKER_APP_URL=https://ellifedash.github.io/mediassist-pro/

# Your deployed admin portal URL (for CORS — use * during local dev)
supabase secrets set ADMIN_PORTAL_ORIGIN=https://your-admin-portal.netlify.app

# These two are set automatically by Supabase — no action needed:
# SUPABASE_URL
# SUPABASE_SERVICE_ROLE_KEY
# SUPABASE_ANON_KEY
```

### 3d. Deploy the function
```bash
supabase functions deploy admin-staff --no-verify-jwt
```

> `--no-verify-jwt` is required because the function handles JWT verification manually inside the handler (to return clean error messages instead of Supabase's generic 401).

### 3e. Get your Edge Function URL
```
https://YOUR_PROJECT_ID.supabase.co/functions/v1/admin-staff
```

---

## Step 4 — Configure `js/admin.js`

Open `js/admin.js` and replace the three placeholder values at the top:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';  // anon/public key — safe to expose
const WORKER_APP_URL    = 'https://ellifedash.github.io/mediassist-pro/';
```

Get `SUPABASE_URL` and `SUPABASE_ANON_KEY` from:  
**Supabase Dashboard → Project Settings → API → Project URL & anon/public key**

> The `EDGE_FN_BASE` constant is derived automatically from `SUPABASE_URL` — no separate change needed.

---

## Step 5 — Deploy the Admin Portal

This is a static site — zero build steps.

### Option A: GitHub Pages
1. Push to a new GitHub repo (`nankana-admin-portal`)
2. **Settings → Pages → Branch: main / root** → Save
3. Your portal lives at `https://YOUR_USERNAME.github.io/nankana-admin-portal/`

### Option B: Netlify (recommended — custom domain + HTTPS)
1. Push to GitHub
2. **Netlify → Add new site → Import from Git** → select repo
3. Build command: *(leave empty)* · Publish directory: `.`
4. Deploy

### After deploying — update the CORS secret:
```bash
supabase secrets set ADMIN_PORTAL_ORIGIN=https://your-admin-portal.netlify.app
supabase functions deploy admin-staff --no-verify-jwt  # redeploy to pick up new secret
```

---

## Step 6 — Configure Supabase Auth Settings

In **Supabase Dashboard → Authentication → URL Configuration**:

| Field | Value |
|---|---|
| Site URL | `https://your-admin-portal.netlify.app` |
| Redirect URLs | `https://your-admin-portal.netlify.app` **and** `https://ellifedash.github.io/mediassist-pro/` |

The second redirect URL is critical — it's where magic links take staff members after clicking the email link.

---

## How Each Feature Works

### Admin Login
- `supabase.auth.signInWithPassword({ email, password })`
- On load, `supabase.auth.getSession()` checks for an active session — no login screen flicker for returning admins
- `onAuthStateChange` listens for `SIGNED_OUT` to restore the login screen if the session is revoked

### Staff Onboarding Invite
1. Admin enters staff email → clicks **Send Onboarding Invite**
2. Frontend POSTs `{ action: 'invite', email }` to the Edge Function with the admin's JWT in the `Authorization` header
3. Edge Function verifies the JWT, then calls `admin.auth.admin.inviteUserByEmail(email)` using the service_role key
4. Supabase sends the invite email via your project's SMTP config
5. Staff member clicks the link → sets their password → account created → they appear in the Staff Directory

> **SMTP note:** Supabase free tier uses a rate-limited built-in SMTP (4 emails/hour). For production, configure a custom SMTP provider in **Authentication → Email Settings**.

### Staff Directory
1. On dashboard load, frontend POSTs `{ action: 'list' }` to the Edge Function
2. Edge Function calls `admin.auth.admin.listUsers()` and returns a trimmed user array
3. Each row shows: email avatar, **animated session status pulse** (active/idle/dormant derived from `last_sign_in_at`), creation date, last seen date, and the magic link button

**Session status logic:**
| Status | Condition | Indicator |
|---|---|---|
| Active | Signed in within 24 hours | 🟢 Animated green pulse |
| Idle | Signed in within 7 days | 🟡 Amber static dot |
| Dormant | > 7 days or never | ⚫ Slate static dot |

### Magic Link Dispatch
- Calls `supabase.auth.signInWithOtp({ email, options: { redirectTo: WORKER_APP_URL, shouldCreateUser: false } })`
- Runs client-side with the anon key — `signInWithOtp` is a public auth method, no admin key needed
- `shouldCreateUser: false` ensures it only works for **existing** accounts — prevents accidental account creation
- Staff member receives an email, clicks the link, and lands directly inside MediAssist Pro with an active session

---

## Security Model

| Layer | Mechanism |
|---|---|
| Admin portal access | Email + password, Supabase Auth session |
| Edge Function calls | Admin JWT verified server-side before any operation |
| `service_role` key | Stored as Supabase secret — never touches the browser |
| Staff invites | Server-side only via Edge Function |
| Magic link dispatch | Client-side `signInWithOtp` — safe with anon key |
| `appointments` table | Public INSERT (booking form) + authenticated SELECT/UPDATE (staff) |
| `admin_audit_log` | Authenticated SELECT only; INSERT via service_role from Edge Function |

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Login fails with "Invalid credentials" | Wrong email or password | Reset via Supabase Dashboard → Authentication → Users → Reset password |
| "Could not load staff directory" | Edge Function not deployed or CORS mismatch | Check `supabase functions deploy` ran successfully; verify `ADMIN_PORTAL_ORIGIN` secret |
| Invite email never arrives | SMTP rate limit or not configured | Check Supabase Dashboard → Authentication → Logs; configure custom SMTP for production |
| Magic link opens wrong URL | `redirectTo` mismatch | Ensure `WORKER_APP_URL` in `admin.js` matches the URL in Supabase → Authentication → Redirect URLs |
| Staff appear in directory but can't log in to MediAssist Pro | Session expired | Use "Send Magic Link" button to restore their session |
| Edge Function returns 401 | Admin session expired | Log out and log back into the admin portal |

---

## What NOT to do (Architecture Guardrails)

Per `System_Architecture___Project_Boundaries.md`:

- ❌ Do **not** import or reference `admin.js` inside `mediassist-pro/` or `nankana-home-care/`
- ❌ Do **not** add `admin.js` or any admin portal file to `mediassist-pro/sw.js` SHELL cache array
- ❌ Do **not** expose the `service_role` key in any browser-facing script
- ❌ Do **not** allow the admin portal to directly write to `patients`, `visits`, or `services` tables — those belong exclusively to `mediassist-pro`
- ✅ The only shared resource is the **Supabase project** (same database, separate RLS policies per table)
