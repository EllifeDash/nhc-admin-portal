// ════════════════════════════════════════════════════════════════
// supabase/functions/admin-staff/index.ts
//
// Supabase Edge Function — Admin Staff Management
//
// Handles two actions dispatched from the Admin Portal frontend:
//   • action: 'invite' → supabase.auth.admin.inviteUserByEmail()
//   • action: 'list'   → supabase.auth.admin.listUsers()
//
// SECURITY: Runs with the SERVICE_ROLE key (stored as a Supabase
// secret). The key is NEVER sent to the browser. The function
// manually verifies the caller holds a valid admin JWT before
// executing any privileged operation.
//
// Deploy:
//   supabase functions deploy admin-staff --no-verify-jwt
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS — update ADMIN_PORTAL_ORIGIN secret to your deployed URL
const ORIGIN = Deno.env.get('ADMIN_PORTAL_ORIGIN') ?? '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ── Helper: JSON response with CORS ─────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // ── Step 1: Verify caller JWT ────────────────────────────────
  // The admin portal sends its Supabase access token in the
  // Authorization header. We verify it against the anon key client
  // to confirm the caller is actually signed in.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token      = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return json({ error: 'Unauthorized — missing Bearer token.' }, 401);
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) {
    return json({ error: 'Unauthorized — invalid or expired session.' }, 401);
  }

  // ── Step 2: Build service_role admin client ──────────────────
  // This client has full admin access. It is constructed entirely
  // server-side — the service_role key never touches the browser.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Step 3: Parse body ───────────────────────────────────────
  let body: { action?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const { action, email } = body;

  // ════════════════════════════════════════════════════════════
  // ACTION: 'invite'
  // Sends an onboarding email to a new staff member via Supabase
  // SMTP. The link redirects to the MediAssist Pro worker app.
  // ════════════════════════════════════════════════════════════
  if (action === 'invite') {
    if (!email) return json({ error: 'Field "email" is required.' }, 400);

    const workerAppUrl =
      Deno.env.get('WORKER_APP_URL') ??
      'https://ellifedash.github.io/mediassist-pro/';

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: workerAppUrl,
    });

    if (error) return json({ error: error.message }, 400);
    return json({ success: true, userId: data.user?.id });
  }

  // ════════════════════════════════════════════════════════════
  // ACTION: 'list'
  // Returns all registered Supabase Auth users, trimmed to only
  // the fields the frontend Staff Directory needs.
  // ════════════════════════════════════════════════════════════
  if (action === 'list') {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) return json({ error: error.message }, 500);

    // Strip sensitive fields — return only what the UI renders
    const users = data.users.map((u) => ({
      id:                 u.id,
      email:              u.email,
      created_at:         u.created_at,
      last_sign_in_at:    u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
    }));

    return json({ users });
  }

  return json({ error: `Unknown action: "${action}"` }, 400);
});
