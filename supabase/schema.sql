-- =============================================================================
-- SparkySolve — National Sparky App  |  Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy search on clients

-- =============================================================================
-- 1. user_profiles
--    Created automatically when a user signs up via the trigger below.
--    Stripe fields populated by the webhook (service-role only).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                   TEXT        NOT NULL DEFAULT 'free'
                           CHECK (tier IN ('free', 'starter', 'pro', 'business')),
  stripe_customer_id     TEXT        UNIQUE,
  stripe_subscription_id TEXT        UNIQUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- No UPDATE policy — profile mutations happen via service-role (webhook/API only)

-- ─── Auto-create profile on signup ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Auto-update updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 2. usage_events
--    Inserted server-side (service-role) only — users can SELECT their own.
--    Used to enforce the free-tier diagnostic limit.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.usage_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL CHECK (event_type IN ('diagnostic', 'export', 'sync')),
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_select_own"
  ON public.usage_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT policy: only service-role (Edge Function) inserts usage events

CREATE INDEX IF NOT EXISTS idx_usage_user_type_date
  ON public.usage_events (user_id, event_type, created_at DESC);


-- =============================================================================
-- 3. diagnostic_logs
--    Inserted server-side after each successful Gemini call.
--    Users can SELECT and DELETE their own rows.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.diagnostic_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_text   TEXT        NOT NULL,
  response_text  TEXT,
  has_image      BOOLEAN     NOT NULL DEFAULT FALSE,
  tier_at_time   TEXT        NOT NULL DEFAULT 'free',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.diagnostic_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs_select_own"
  ON public.diagnostic_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "logs_delete_own"
  ON public.diagnostic_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT policy: inserted by service-role in the Edge Function

CREATE INDEX IF NOT EXISTS idx_logs_user_date
  ON public.diagnostic_logs (user_id, created_at DESC);


-- =============================================================================
-- 4. clients
--    Full CRUD owned by the authenticated user (via RLS).
--    Persists the dispatch / route client list.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  address     TEXT,
  phone       TEXT,
  notes       TEXT,
  latitude    NUMERIC(10, 7),
  longitude   NUMERIC(10, 7),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_all_own"
  ON public.clients FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_clients_user
  ON public.clients (user_id, created_at DESC);

-- Trigram index for fast name search
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
  ON public.clients USING GIN (name gin_trgm_ops);


-- =============================================================================
-- Verification — run this after migration to confirm all tables exist
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
