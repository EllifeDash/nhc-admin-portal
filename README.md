# NHC Admin Portal

**Tier 3** of the Nankana Home Care three-tier ecosystem.

| Tier | Product | Role |
|------|---------|------|
| 1 | [Nankana Home Care Web Brochure](https://github.com/ellifedash/nankana-home-care) | Public-facing patient booking site |
| 2 | [MediAssist Pro PWA](https://github.com/ellifedash/mediassist-pro) | Offline-first patient management app for medical assistants |
| 3 | **NHC Admin Portal** *(this repo)* | Secure admin dashboard for staff onboarding and magic-link dispatch |

---

## Overview

Administrative dashboard for Nankana Home Care. Provides the owner/administrator with:

- **Staff Directory** — view all registered medical assistant accounts with session status
- **Onboard Staff** — send email invitations to create MediAssist Pro accounts
- **Magic Link Dispatch** — send passwordless login links to existing staff
- **Delete User** — remove staff accounts from Supabase Auth

All sensitive operations (invite, delete, list users) are proxied through a Supabase Edge Function that runs with the `service_role` key — never exposed in the browser.

## Project Structure

```
nhc-admin-portal/
├── index.html                    # Login screen + app shell (team directory + onboarding)
├── css/
│   └── style.css                 # Admin-specific styles
├── js/
│   └── admin.js                  # Auth, Edge Function calls, staff table render
├── supabase/
│   └── functions/
│       └── admin-staff/
│           └── index.ts          # Edge Function: invite / list / delete users
├── AGENTS.md
└── README.md
```

## Integration Loop

1. **Administrator** sends an onboarding invite → staff member receives email
2. **Staff member** sets password → appears in Staff Directory
3. **Administrator** sends magic link → staff member opens MediAssist Pro
4. **All tiers** share the same Supabase project (database + auth)

## Deployment

Static site — no build step. Deploy to GitHub Pages or Netlify (publish directory: `.`).

The Edge Function must be deployed separately:
```
supabase functions deploy admin-staff --no-verify-jwt
```
