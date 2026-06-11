// ════════════════════════════════════════════════════════════════
// admin.js — Nankana Home Care · Administrative Portal
//
// Responsibilities:
//   1. Silent session check on load  → show login or dashboard
//   2. Email/password sign-in        → supabase.auth.signInWithPassword()
//   3. Staff onboarding invite       → Supabase Admin Edge Function POST
//   4. Staff directory               → supabase.auth.admin.listUsers()
//                                      via a secure Edge Function proxy
//   5. Magic link dispatch           → supabase.auth.signInWithOtp()
//      (redirects to mediassist-pro worker app)
//   6. Sign-out
//
// Architecture note: this file is COMPLETELY isolated from both
//   nankana-home-care/js/  and  mediassist-pro/js/
// It lives in its own repo: nankana-admin-portal/js/admin.js
// ════════════════════════════════════════════════════════════════


import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';


// ── ⚠️  REPLACE THESE WITH YOUR PROJECT CREDENTIALS ──────────────
// Supabase Dashboard → Project Settings → API
// Use the anon/public key here; sensitive admin ops go through
// Edge Functions that run with the service_role key server-side.
const SUPABASE_URL      = 'https://gkfotrghyydydbfoakaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZm90cmdoeXlkeWRiZm9ha2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzk4MzEsImV4cCI6MjA5Mjg1NTgzMX0.sXZRa4tO8AkUQ-Sn34rqjatlLCXbt7dRrdi9qcq1-Lc';
const WORKER_APP_URL    = 'https://ellifedash.github.io/med_pwa_app/';

// Edge Function URL — deployed in your Supabase project.
// See SETUP_GUIDE.md for the full Edge Function source code.
// Replace with your actual function URL after deployment:
const EDGE_FN_BASE = `${SUPABASE_URL}/functions/v1/admin-staff`;

const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── DOM refs ─────────────────────────────────────────────────────
const $loginScreen   = document.getElementById('login-screen');
const $appShell      = document.getElementById('app-shell');
const $loginError    = document.getElementById('loginError');
const $loginBtn      = document.getElementById('loginBtn');
const $staffBody     = document.getElementById('staffTableBody');
const $staffCount    = document.getElementById('staffCount');
const $adminEmail    = document.getElementById('adminEmail');
const $adminAvatar   = document.getElementById('adminAvatar');
const $inviteBtn     = document.getElementById('inviteBtn');
const $inviteEmail   = document.getElementById('inviteEmail');
const $panelTeam     = document.getElementById('panel-team');
const $panelOnboard  = document.getElementById('panel-onboard');
const $navTeam       = document.getElementById('nav-team');
const $navOnboard    = document.getElementById('nav-onboard');

// ── Toast ─────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'default') {
  const el = document.getElementById('toast');
  el.textContent  = msg;
  el.className    = `show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Button loading state ──────────────────────────────────────────
function setLoading(btn, state) {
  btn.disabled = state;
  btn.classList.toggle('loading', state);
}

// ── Sidebar navigation ────────────────────────────────────────────
function showPanel(panel) {
  // panels
  $panelTeam.style.display    = panel === 'team'    ? '' : 'none';
  $panelOnboard.style.display = panel === 'onboard' ? '' : 'none';
  // nav active states
  $navTeam.classList.toggle('active',    panel === 'team');
  $navOnboard.classList.toggle('active', panel === 'onboard');
}

$navTeam.addEventListener('click',    () => showPanel('team'));
$navOnboard.addEventListener('click', () => {
  showPanel('onboard');
});

// ── Show/hide screens ─────────────────────────────────────────────
function showLogin() {
  $loginScreen.style.display = 'flex';
  $appShell.classList.remove('visible');
}

function showApp(user) {
  $loginScreen.style.display = 'none';
  $appShell.classList.add('visible');

  // Populate sidebar with logged-in admin info
  const email = user?.email ?? '—';
  $adminEmail.textContent  = email;
  $adminAvatar.textContent = email ? email[0].toUpperCase() : 'A';

  // Load staff on first open
  loadStaffDirectory();
}


// ════════════════════════════════════════════════════════════════
// 1. SESSION CHECK — runs immediately on page load
// ════════════════════════════════════════════════════════════════
(async () => {
  const { data: { session } } = await _sb.auth.getSession();
  if (session?.user) {
    showApp(session.user);
  } else {
    showLogin();
  }
})();

// Keep session alive and react to sign-out events
_sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') showLogin();
});


// ════════════════════════════════════════════════════════════════
// 2. ADMIN LOGIN
// ════════════════════════════════════════════════════════════════

/** Called by the Sign In button's onclick. */
window.handleLogin = async function () {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  // Clear previous error
  $loginError.textContent = '';
  $loginError.classList.remove('visible');

  if (!email || !password) {
    $loginError.textContent = 'Please enter your email and password.';
    $loginError.classList.add('visible');
    return;
  }

  setLoading($loginBtn, true);

  const { data, error } = await _sb.auth.signInWithPassword({ email, password });

  setLoading($loginBtn, false);

  if (error) {
    $loginError.textContent = error.message;
    $loginError.classList.add('visible');
    return;
  }

  showApp(data.user);
};

// Allow Enter key to submit the login form
['loginEmail', 'loginPassword'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.handleLogin();
  });
});


// ════════════════════════════════════════════════════════════════
// 3. STAFF ONBOARDING INVITE
//
// Calls the `admin-staff` Edge Function (action: 'invite').
// The Edge Function runs with the Supabase SERVICE_ROLE key so
// it can call supabase.auth.admin.inviteUserByEmail() server-side.
// NEVER expose the service_role key in frontend JS.
// ════════════════════════════════════════════════════════════════

window.handleInvite = async function () {
  const email = $inviteEmail.value.trim();

  if (!email || !email.includes('@')) {
    toast('Enter a valid email address.', 'danger');
    return;
  }

  setLoading($inviteBtn, true);

  try {
    const { data: { session } } = await _sb.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(EDGE_FN_BASE, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'invite', email }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error ?? `Server error ${res.status}`);
    }

    toast(`Invitation sent to ${email}`, 'success');
    $inviteEmail.value = '';

  } catch (err) {
    console.error('[admin] invite error:', err);
    toast(err.message || 'Failed to send invite. Try again.', 'danger');
  } finally {
    setLoading($inviteBtn, false);
  }
};


// ════════════════════════════════════════════════════════════════
// 4. STAFF DIRECTORY — load & render
//
// Calls the `admin-staff` Edge Function (action: 'list').
// The Edge Function returns the Supabase auth user list.
// ════════════════════════════════════════════════════════════════

async function loadStaffDirectory() {
  renderSkeletons();

  try {
    const { data: { session } } = await _sb.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(EDGE_FN_BASE, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'list' }),
    });

    const json = await res.json();

    if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`);

    const users = json.users ?? [];
    $staffCount.textContent = users.length;
    renderStaffTable(users);

  } catch (err) {
    console.error('[admin] loadStaff error:', err);
    $staffBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="table-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>Could not load staff directory</p>
            <span>${err.message}</span>
          </div>
        </td>
      </tr>`;
  }
}

/** Render placeholder skeleton rows while fetching. */
function renderSkeletons() {
  $staffBody.innerHTML = Array.from({ length: 4 }, () => `
    <tr class="skel-row">
      <td><div class="skeleton" style="width:70%"></div></td>
      <td><div class="skeleton" style="width:55%"></div></td>
      <td><div class="skeleton" style="width:60%"></div></td>
      <td><div class="skeleton" style="width:50%"></div></td>
      <td><div class="skeleton" style="width:40%"></div></td>
    </tr>`).join('');
}

/** Determine session status category from last_sign_in_at. */
function sessionStatus(lastSignIn) {
  if (!lastSignIn) return { cls: 'dormant', label: 'Never signed in' };
  const hours = (Date.now() - new Date(lastSignIn).getTime()) / 36e5;
  if (hours < 24)  return { cls: 'active',  label: 'Active today' };
  if (hours < 168) return { cls: 'idle',    label: 'Idle this week' };
  return              { cls: 'dormant', label: 'Dormant' };
}

/** Format ISO date string to e.g. "12 Jun 2025" */
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${mo[d.getMonth()]} ${d.getFullYear()}`;
}

/** Render the full staff table from a Supabase users array. */
function renderStaffTable(users) {
  if (!users.length) {
    $staffBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="table-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
            <p>No staff accounts yet</p>
            <span>Use "Onboard Staff" to send the first invitation.</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  $staffBody.innerHTML = users.map(u => {
    const st  = sessionStatus(u.last_sign_in_at);
    const initials = u.email ? u.email[0].toUpperCase() : '?';

    return `<tr>
      <td>
        <div class="staff-email">
          <div class="staff-av">${initials}</div>
          <span class="truncate" style="max-width:220px">${u.email ?? '—'}</span>
        </div>
      </td>
      <td>
        <div class="status-cell">
          <span class="status-dot ${st.cls}"></span>
          <span class="status-label">${st.label}</span>
        </div>
      </td>
      <td class="tsm ts">${fmtDate(u.created_at)}</td>
      <td class="tsm ts">${fmtDate(u.last_sign_in_at)}</td>
      <td>
        <div class="actions-cell">
          <button
            class="btn btn-teal btn-sm"
            id="ml-btn-${u.id}"
            onclick="sendMagicLink('${u.email}', '${u.id}')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span class="btn-label">✉️ Send Magic Link</span>
            <span class="spinner" style="border-color:rgba(10,25,47,.3);border-top-color:var(--navy)"></span>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}


// ════════════════════════════════════════════════════════════════
// 5. MAGIC LINK — send passwordless login to a staff member
//
// Uses supabase.auth.signInWithOtp() with the staff member's email.
// Supabase sends them a login link that redirects to the
// MediAssist Pro worker app on mediassist-pro GitHub Pages.
//
// This runs CLIENT-SIDE with the anon key — signInWithOtp is
// a public-facing auth method (no admin privileges needed).
// ════════════════════════════════════════════════════════════════

window.sendMagicLink = async function (email, userId) {
  const btn = document.getElementById(`ml-btn-${userId}`);
  if (!btn) return;

  setLoading(btn, true);

  try {
    const { error } = await _sb.auth.signInWithOtp({
      email,
      options: {
        // Deep-links the staff member directly into MediAssist Pro
        // after they click the magic link in their email.
        redirectTo: WORKER_APP_URL,
        // Do NOT create a new user if one doesn't exist.
        // We only want to refresh sessions for existing accounts.
        shouldCreateUser: false,
      },
    });

    if (error) throw error;

    toast(`Magic link sent to ${email}`, 'success');

  } catch (err) {
    console.error('[admin] magicLink error:', err);
    toast(err.message || 'Failed to send magic link.', 'danger');
  } finally {
    setLoading(btn, false);
  }
};


// ════════════════════════════════════════════════════════════════
// 6. SIGN OUT  -end
// ════════════════════════════════════════════════════════════════

window.handleLogout = async function () {
  await _sb.auth.signOut();
  showLogin();
};
