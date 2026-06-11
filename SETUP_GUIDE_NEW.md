# Nankana Admin Portal — New Setup Guide

Step-by-step manual for setting up the admin portal from scratch.
**Do these steps in order.** Each step ends with a ✅ verification so you know it worked before moving on.

---

## Prerequisites

Before starting, make sure you have:

- A **Supabase account** (free tier works) — sign up at https://supabase.com/dashboard
- **Node.js** (v18+) installed — needed for the Supabase CLI
- A **GitHub account** — to host the portal
- Your **MediAssist Pro worker app URL** (e.g. `ellifedash.github.io/med_pwa_app/`) — staff magic links redirect here

---

## Step 1 — Create the Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **New project**
3. Fill in:
   - **Name**: `MediAssist-Pro` (or whatever you named it)
   - **Database Password**: Create a strong password and save it somewhere
   - **Region**: Choose the closest to your users
4. Click **Create new project** and wait ~2 minutes for provisioning

> Already have a project? You can reuse your existing one. Just note its **project ref** (the long ID in your project URL: `https://gkfotrghyydydbfoakaq.supabase.co`).

✅ **Verify**: You should see the project dashboard with your project's URL visible in the browser address bar.

---

## Step 2 — Get Your API Credentials

1. In your Supabase dashboard, go to **Project Settings → API** (in the left sidebar, under "Configuration")
2. Find these two values and copy them somewhere safe:

   | Field | Where to find it |
   |---|---|
   | **Project URL** | `https://[YOUR_PROJECT_REF].supabase.co` — shown at the top |
   | **anon/public key** | Listed under "Project API keys" — it starts with `eyJhbGciOi...` |

   > The **service_role key** is also listed here — do NOT copy it. You will never put it in the frontend code.

✅ **Verify**: You have two strings: a URL like `https://xxx.supabase.co` and a long base64 key starting with `eyJ`.

---

## Step 3 — Run the Database Setup

1. In your Supabase dashboard, go to **SQL Editor** (in the left sidebar)
2. Click **New query**
3. Open the file `setup.sql` from this repo in a text editor
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`)

At the bottom of the output, you should see a table like:

| tablename | rls_enabled |
|---|---|
| admin_audit_log | true |
| appointments | true |

✅ **Verify**: The final `SELECT` query returns both rows with `rls_enabled = true`.

---

## Step 4 — Create Your Admin Account

The admin portal uses **email + password** login (not magic link). You need to create the first admin user manually.

1. In your Supabase dashboard, go to **Authentication → Users**
2. Click **Add user**
3. Enter:
   - **Email**: Your admin email (e.g. `admin@nankana.com`)
   - **Password**: Choose a strong password
4. Click **Create user**
5. (Optional but recommended) Click **Confirm** to confirm the user's email immediately

> This is the **only** account that can log into the admin portal. Staff members use magic links to log into MediAssist Pro, not this portal.

✅ **Verify**: The new user appears in the Authentication → Users table with a confirmed email.

---

## Step 5 — Configure `js/admin.js`

Open `js/admin.js` in a text editor and replace the three placeholder values near the top:

```js
const SUPABASE_URL      = 'https://gkfotrghyydydbfoakaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZm90cmdoeXlkeWRiZm9ha2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzk4MzEsImV4cCI6MjA5Mjg1NTgzMX0.sXZRa4tO8AkUQ-Sn34rqjatlLCXbt7dRrdi9qcq1-Lc';
const WORKER_APP_URL    = 'https://ellifedash.github.io/med_pwa_app/';
```

Replace with:

| Placeholder | Replace with | Where to get it |
|---|---|---|
| `YOUR_PROJECT_ID` | Your project ref from Step 2 | Supabase Dashboard → Project Settings → API → Project URL |
| `YOUR_ANON_PUBLIC_KEY` | The anon/public key from Step 2 | Supabase Dashboard → Project Settings → API → anon/public key |
| `ellifedash.github.io/mediassist-pro/` | Your actual MediAssist Pro URL | Your deployed worker app URL |

> The `EDGE_FN_BASE` on line 33 is derived automatically from `SUPABASE_URL` — no separate change needed.

Save the file.

✅ **Verify**: The three constants at the top of `admin.js` now point to your real project (no `YOUR_` placeholders remain).

---

## Step 6 — Install Supabase CLI

You need the Supabase CLI to deploy the Edge Function.

```bash
npm install -g supabase
```

Check it installed:

```bash
supabase --version
# Should print something like 1.x.x
```

✅ **Verify**: `supabase --version` prints a version number without errors.

---

## Step 7 — Link the CLI to Your Project

Authenticate and link the local repo to your Supabase project:

```bash
supabase login
```

This opens your browser. Log in to your Supabase account and copy the token back into the terminal.

Then link the project:

```bash
supabase link --project-ref YOUR_PROJECT_ID
```

Replace `YOUR_PROJECT_ID` with your actual project ref (e.g. `gkfotrghyydydbfoakaq`).

You can find your project ref in:
- **Supabase Dashboard → Project Settings → General → Reference ID**
- Or look at your project URL: `https://[PROJECT_REF].supabase.co`

✅ **Verify**: The command outputs something like `Finished supabase link.` with no errors.

---

## Step 8 — Set Edge Function Secrets

The Edge Function needs two environment secrets to work:

```bash
supabase secrets set WORKER_APP_URL=https://ellifedash.github.io/med_pwa_app/
supabase secrets set ADMIN_PORTAL_ORIGIN=https://ellifedash.github.io/nhc-admin-portal/
```

| Secret | What it is | Value to use |
|---|---|---|
| `WORKER_APP_URL` | Where staff magic links redirect | Your deployed MediAssist Pro URL |
| `ADMIN_PORTAL_ORIGIN` | CORS origin — your deployed admin portal URL | Use `*` temporarily if not deployed yet; update after Step 11 |

> Three other secrets are set automatically by Supabase and need no action:
> - `SUPABASE_URL`
> - `SUPABASE_ANON_KEY`
> - `SUPABASE_SERVICE_ROLE_KEY`

✅ **Verify**: Run `supabase secrets list`. You should see `WORKER_APP_URL` and `ADMIN_PORTAL_ORIGIN` in the list (plus the three auto-set ones).

---

## Step 9 — Deploy the Edge Function

```bash
supabase functions deploy admin-staff --no-verify-jwt
```

> The `--no-verify-jwt` flag is **intentional and required**. The Edge Function verifies the JWT manually inside its handler (so it can return clean error messages instead of Supabase's generic 401). Never remove this flag.

✅ **Verify**: The output says `Deployed` and gives you a URL like:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-staff
```
https://gkfotrghyydydbfoakaq.supabase.co/functions/v1/admin-staff

Save this URL — it's `EDGE_FN_BASE`.

---

## Step 10 — Verify the Edge Function Works

Test the function with curl (from your terminal):

```bash
curl -X POST https://gkfotrghyydydbfoakaq.supabase.co/functions/v1/admin-staff \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -d '{"action":"list"}'
```

To get a valid admin JWT:
1. Log into the admin portal (once Step 11-12 are done)
2. Open browser DevTools → Application → Local Storage
3. Copy the Supabase access token from `sb-[PROJECT_REF]-auth-token`

Or test without auth to confirm the 401 works:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-staff \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
# Should return: {"error":"Unauthorized — missing Bearer token."}
```

✅ **Verify**: Without a token you get a 401. With a valid token you get a JSON response (possibly an empty users array).

---

## Step 11 — Deploy the Admin Portal (Static Site)

The admin portal is a static site — **zero build steps**. Choose one option:

### Option A: GitHub Pages (simpler)

1. Create a new GitHub repo (e.g. `nankana-admin-portal`)
2. Push the code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/nankana-admin-portal.git
   git branch -M main
   git push -u origin main
   ```
3. In your GitHub repo, go to **Settings → Pages**
4. Under **Branch**, select `main` and `/ (root)`, then click **Save**
5. Wait ~2 minutes. Your portal will be at:
   `https://YOUR_USERNAME.github.io/nankana-admin-portal/`

### Option B: Netlify (recommended — custom domain, HTTPS)

1. Push the code to a GitHub repo (same as above)
2. Go to https://app.netlify.com → **Add new site → Import an existing project**
3. Connect your GitHub repo
4. Settings:
   - **Build command**: *(leave empty)*
   - **Publish directory**: `.`
5. Click **Deploy**
6. After deploy, optionally set a custom domain in Netlify → Domain Settings

✅ **Verify**: Opening the URL in a browser shows the admin portal login screen.

---

## Step 12 — Update CORS Secret + Redeploy Edge Function

Now that your portal has a live URL, update the CORS origin and redeploy:

```bash
supabase secrets set ADMIN_PORTAL_ORIGIN=https://ellifedash.github.io/nhc-admin-portal/
supabase functions deploy admin-staff --no-verify-jwt
```

Replace `https://your-portal-url.com` with your actual deployed portal URL.

✅ **Verify**: The Edge Function deploys successfully with the new secret.

---

## Step 13 — Configure Supabase Auth URLs

1. In Supabase Dashboard, go to **Authentication → URL Configuration**
2. Set these values:

   | Field | Value |
   |---|---|
   | **Site URL** | `https://your-portal-url.com` |
   | **Redirect URLs** | `https://your-portal-url.com` and `https://ellifedash.github.io/mediassist-pro/` |

   - `Site URL` — the admin portal itself
   - First `Redirect URL` — the admin portal (for auth callbacks)
   - Second `Redirect URL` — your MediAssist Pro worker app (where magic links send staff members)

✅ **Verify**: Both URLs are saved in the configuration and show no validation errors.

---

## Step 14 — Configure SMTP (Optional but Recommended)

Supabase's free-tier built-in SMTP is **rate-limited to 4 emails/hour**. For production, configure a custom SMTP:

1. In Supabase Dashboard, go to **Authentication → Email Settings**
2. Under **SMTP Settings**, toggle **Enable custom SMTP**
3. Enter your SMTP provider details (SendGrid, Mailgun, Resend, etc.)
4. Click **Save**

> Without this, onboarding invites and magic links will stop working after 4 sends per hour.

✅ **Verify**: A test email from Supabase's SMTP test function arrives in your inbox.

---

## Step 15 — Final Test: End-to-End Verification

Open your deployed admin portal URL and go through this checklist:

- [ ] **Login screen appears** — clean centered login card
- [ ] **Login works** — enter your admin email/password from Step 4, click Sign In
- [ ] **Dashboard loads** — sidebar shows your email, Staff Directory panel is visible
- [ ] **Empty state renders** — "No staff accounts yet" message shows (no users yet)
- [ ] **Invite works** — go to Onboard Staff, enter an email, click invite. Green toast: "Invitation sent to ..."
- [ ] **Invite email arrives** — check the recipient's inbox (may take a minute; check spam)
- [ ] **Staff appears in directory** — after they sign up via the invite link, refresh the directory
- [ ] **Magic link works** — click "Send Magic Link" on a staff member. Green toast confirms.
- [ ] **Magic link email arrives** — staff member can click it and land in MediAssist Pro
- [ ] **Session persistence** — close the tab, re-open the portal URL. You should be logged in still.
- [ ] **Logout works** — click the logout icon in the sidebar. Login screen re-appears.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Login fails "Invalid credentials" | Wrong email or password | Reset via Supabase Dashboard → Authentication → Users → the user → Reset password |
| "Could not load staff directory" | Edge Function not deployed or CORS mismatch | Check `supabase functions deploy` ran without errors; verify `ADMIN_PORTAL_ORIGIN` secret is set to your exact deployed URL |
| Invite email never arrives | SMTP rate limit or not configured | Check Supabase Dashboard → Authentication → Logs for email send errors; configure custom SMTP for production |
| Magic link opens wrong URL | `redirectTo` mismatch | Ensure `WORKER_APP_URL` in `admin.js` matches the URL in Supabase Auth → Redirect URLs |
| Edge Function returns 401 | Admin session expired | Log out and log back into the admin portal to get a fresh session |
| CORS error in browser console | `ADMIN_PORTAL_ORIGIN` doesn't match your deployed URL | Run `supabase secrets set ADMIN_PORTAL_ORIGIN=...` and redeploy |
| `supabase link` fails | Wrong project ref | Find your project ref in Supabase Dashboard → Project Settings → General → Reference ID |

---

## Architecture Notes

- **Service role key** is kept server-side in the Edge Function — never in the browser
- **Admin login** uses Supabase Auth `signInWithPassword()` — not hardcoded credentials
- **Staff invites** go through the Edge Function, which uses the service_role key server-side
- **Magic links** run client-side with the anon key — `signInWithOtp` is a public API
- **`shouldCreateUser: false`** — magic links only work for existing accounts, prevents accidental signups

### Files in this repo

```
nankana-admin-portal/
├── index.html                    ← Single-page admin shell
├── css/style.css                 ← All styles (CSS variables)
├── js/admin.js                   ← All auth + UI logic (ES module)
├── supabase/functions/admin-staff/
│   └── index.ts                  ← Edge Function (invite + list)
├── setup.sql                     ← Run once in Supabase SQL Editor
├── SETUP_GUIDE_NEW.md            ← This file
├── AGENTS.md                     ← Instructions for AI coding assistants
└── README.md
```
