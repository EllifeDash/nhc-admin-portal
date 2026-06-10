-- ════════════════════════════════════════════════════════════════
-- Nankana Admin Portal — SQL Setup
-- Run this in: Supabase Dashboard → SQL Editor → New Query
--
-- What this does:
--   1. Creates the `appointments` table (if not already created
--      by the booking-submit.js public website flow)
--   2. Sets RLS so public visitors can INSERT bookings,
--      and authenticated admin/staff can read & update them
--   3. Creates an `admin_audit_log` table to record key admin
--      actions (invites sent, magic links dispatched) for
--      accountability — purely append-only from Edge Functions
-- ════════════════════════════════════════════════════════════════


-- ── 1. APPOINTMENTS TABLE ────────────────────────────────────────
-- Public booking requests submitted via the marketing website.
-- Managed by staff inside MediAssist Pro (bookings.js).

CREATE TABLE IF NOT EXISTS public.appointments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name   TEXT        NOT NULL,
  phone          TEXT        NOT NULL,
  age            INTEGER,
  gender         TEXT,
  address        TEXT        NOT NULL,
  service        TEXT        NOT NULL,
  preferred_date DATE        NOT NULL,
  preferred_time TEXT        NOT NULL,
  notes          TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','accepted','rejected','completed')),
  handled_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Public (anon) can only INSERT new bookings
CREATE POLICY "Public can submit bookings"
  ON public.appointments FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated staff can read all appointments
CREATE POLICY "Staff can read appointments"
  ON public.appointments FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated staff can update status / handled_by
CREATE POLICY "Staff can update appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── 2. ADMIN AUDIT LOG ───────────────────────────────────────────
-- Lightweight append-only log written by the Edge Function.
-- Gives you a traceable record of who invited whom, when.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT        NOT NULL,  -- e.g. 'invite_sent', 'magic_link_sent'
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the service_role (Edge Function) can insert audit rows.
-- No user, including authenticated admins, can insert directly.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated admins can read the log (read-only in the browser)
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (true);

-- INSERT is performed only via service_role from Edge Functions.
-- No browser-side policy is needed for INSERT — service_role bypasses RLS.


-- ── 3. ENABLE REALTIME on appointments ──────────────────────────
-- Allows MediAssist Pro's bookings.js to subscribe to live
-- INSERT events on the appointments table.

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;


-- ── 4. VERIFY ────────────────────────────────────────────────────
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('appointments', 'admin_audit_log')
ORDER BY tablename;
