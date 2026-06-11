# NHC Admin Portal — AGENTS.md

**Tier 3** of the Nankana Home Care three-tier ecosystem. Admin dashboard for staff onboarding and magic-link dispatch.

## Stack

Vanilla JS (ES module, no framework) · HTML5 · CSS custom properties · Supabase Auth + Edge Functions.
**Zero build step** — `index.html` is served as-is. No package.json, no Node deps for the frontend.

## Commands

| Action | Command |
|---|---|
| Deploy Edge Function | `supabase functions deploy admin-staff --no-verify-jwt` |
| Link Supabase project | `supabase link --project-ref YOUR_PROJECT_ID` |
| Set secrets | `supabase secrets set WORKER_APP_URL=... ADMIN_PORTAL_ORIGIN=...` |

## Key architecture

- Single page: `index.html` → login screen ↔ app shell (two panels: Staff Directory + Onboarding)
- All UI + auth logic: `js/admin.js` — Supabase JS client imported from CDN
- Edge Function: `supabase/functions/admin-staff/index.ts` (Deno/TypeScript, three actions: `invite`, `list`, `delete`)

## Must-know constraints

1. **`service_role` key must never touch the browser.** All admin auth operations go through the Edge Function, which uses the `service_role` key server-side. The frontend only has the anon key.
2. **`--no-verify-jwt` is intentional.** The Edge Function verifies the JWT manually inside the handler. Never remove this flag.
3. **Three placeholders to replace before deployment** in `js/admin.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WORKER_APP_URL`.
4. **Magic links use `shouldCreateUser: false`** — only works for existing accounts.
5. **Part of 3-tier ecosystem.** Tier 1: public brochure, Tier 2: MediAssist Pro PWA, Tier 3: this admin portal.

## Deploy

Static site — no build command. Deploy to GitHub Pages (root) or Netlify (publish directory: `.`). After deploying, update the `ADMIN_PORTAL_ORIGIN` secret and redeploy the Edge Function.
