-- sites.sql
-- Supabase/Postgres schema for per-site (widget) configuration
-- Run this in your Supabase SQL editor or psql against the target database.

-- Enable gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table: public.sites
CREATE TABLE IF NOT EXISTS public.sites (
  site_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text,
  description text,
  domain text,
  -- List of allowed origins (CORS) for this site/widget
  allowed_origins jsonb DEFAULT '[]'::jsonb,
  -- Hashed server API key (store only the hash; return raw to owner once on create)
  api_key_hash text,
  -- Public embed flag and optional hashed public token (if you choose to support long-lived public tokens)
  public_embed boolean DEFAULT false,
  public_embed_token_hash text,
  -- Arbitrary widget settings (temperature, topK, UI flags, etc.)
  settings jsonb DEFAULT '{}'::jsonb,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sites_owner_user_id ON public.sites (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON public.sites (domain);
CREATE INDEX IF NOT EXISTS idx_sites_enabled ON public.sites (enabled);
-- GIN index for efficient jsonb containment checks on allowed_origins/settings
CREATE INDEX IF NOT EXISTS idx_sites_allowed_origins_gin ON public.sites USING gin (allowed_origins);
CREATE INDEX IF NOT EXISTS idx_sites_settings_gin ON public.sites USING gin (settings);

-- Trigger: update updated_at timestamp on row update
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_sites_updated_at ON public.sites;
CREATE TRIGGER trg_update_sites_updated_at
BEFORE UPDATE ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NOTES:
-- 1) Storing owner_user_id as uuid without a foreign key avoids cross-schema issues with Supabase auth schema. If you prefer a FK
--    and your environment allows it, you can replace the column declaration with:
--      owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
-- 2) For api_key hashing, use a secure KDF/server-side hash (bcrypt, argon2) or HMAC-SHA256 with a server secret.
--    Never store the raw api key. Return the raw api_key to the user only once at creation.
-- 3) Example usage (create a site from server-side code):
--    INSERT INTO public.sites (owner_user_id, name, domain, allowed_origins, settings, api_key_hash)
--    VALUES ('<owner-uuid>', 'My Site', 'example.com', '["https://example.com"]', '{"topK":5}', '<hashed_api_key>')

-- 4) To restrict queries or enforce multi-tenancy in your application, always filter by owner_user_id and/or site_id in your
--    backend service code when reading or mutating site-related data.
