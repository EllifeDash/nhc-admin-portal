# AGENTS.md — Nankana Admin Portal

## Stack

Vanilla JS (ES module, no framework) · HTML5 · CSS custom properties · Supabase Auth + Edge Functions.
**Zero build step** — `index.html` is served as-is. No package.json, no Node deps for the frontend.

## Commands

| Action | Command |
|---|---|
| Deploy Edge Function | `supabase functions deploy admin-staff --no-verify-jwt` |
| Link Supabase project | `supabase link --project-ref YOUR_PROJECT_ID` |
| Set secrets | `supabase secrets set WORKER_APP_URL=... ADMIN_PORTAL_ORIGIN=...` |

There are no lint, test, typecheck, or dev server commands.

## Key architecture

- Single page: `index.html` → login screen ↔ app shell (two panels: Staff Directory + Onboarding)
- All UI + auth logic: `js/admin.js` — Supabase JS client imported from CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`)
- Edge Function: `supabase/functions/admin-staff/index.ts` (Deno/TypeScript, two actions: `invite` and `list`)
- DB schema: `setup.sql` — run once in Supabase SQL Editor (creates `appointments`, `admin_audit_log` tables + RLS)
- Detailed setup: `SETUP_GUIDE.md`

## Must-know constraints

1. **`service_role` key must never touch the browser.** All admin auth operations go through the Edge Function, which uses the `service_role` key server-side. The frontend only has the anon key.
2. **`--no-verify-jwt` is intentional.** The Edge Function verifies the JWT manually inside the handler (for cleaner error messages). Never remove this flag.
3. **Three placeholders to replace before deployment** in `js/admin.js:27-36`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WORKER_APP_URL`.
4. **Magic links use `shouldCreateUser: false`** (`admin.js:383`) — only works for existing accounts, prevents accidental sign-up.
5. **Isolated repo.** This portal is separate from `nankana-home-care` and `mediassist-pro`. Never import admin files into those repos.

## Deploy

Static site — no build command. Deploy to GitHub Pages (root) or Netlify (publish directory: `.`). After deploying, update the `ADMIN_PORTAL_ORIGIN` secret and redeploy the Edge Function.
