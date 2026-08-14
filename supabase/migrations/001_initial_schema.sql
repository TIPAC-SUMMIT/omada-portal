-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Full initial schema for Omada Captive Portal Payment Platform
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE admin_role AS ENUM ('SUPER_ADMIN', 'SITE_ADMIN', 'VIEWER');

CREATE TYPE site_status AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

CREATE TYPE package_status AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

CREATE TYPE portal_session_status AS ENUM (
  'CREATED',
  'PACKAGE_SELECTED',
  'PAYMENT_INITIATED',
  'PAYMENT_SUCCESS',
  'AUTHORIZED',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE transaction_status AS ENUM (
  'PENDING',
  'PAYMENT_INITIATED',
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'PAYMENT_CANCELLED',
  'PAYMENT_TIMEOUT',
  'OMADA_AUTHORIZING',
  'AUTHORIZED',
  'AUTHORIZATION_FAILED',
  'EXPIRED'
);

CREATE TYPE authorization_status AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'REVOKED'
);

CREATE TYPE audit_action AS ENUM (
  'ADMIN_LOGIN',
  'ADMIN_LOGOUT',
  'ADMIN_CREATED',
  'ADMIN_UPDATED',
  'ADMIN_DELETED',
  'SITE_CREATED',
  'SITE_UPDATED',
  'SITE_DELETED',
  'CONTROLLER_CREATED',
  'CONTROLLER_UPDATED',
  'CONTROLLER_DELETED',
  'PACKAGE_CREATED',
  'PACKAGE_UPDATED',
  'PACKAGE_DELETED',
  'PACKAGE_PRICE_CHANGED',
  'PORTAL_SESSION_CREATED',
  'PAYMENT_INITIATED',
  'PAYMENT_RECEIVED',
  'PAYMENT_FAILED',
  'CLIENT_AUTHORIZED',
  'CLIENT_AUTHORIZATION_FAILED',
  'CLIENT_REVOKED',
  'WEBHOOK_RECEIVED',
  'WEBHOOK_DUPLICATE',
  'WEBHOOK_INVALID'
);

-- ============================================================================
-- ADMINS
-- ============================================================================

CREATE TABLE admins (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  role             admin_role NOT NULL DEFAULT 'VIEWER',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admins_email_unique UNIQUE (email)
);

CREATE INDEX idx_admins_email ON admins (email);

-- ============================================================================
-- SITES
-- ============================================================================

CREATE TABLE sites (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  location         TEXT,
  description      TEXT,
  status           site_status NOT NULL DEFAULT 'ACTIVE',
  timezone         TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sites_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_sites_slug ON sites (slug);
CREATE INDEX idx_sites_status ON sites (status);

-- ============================================================================
-- ADMIN → SITE ASSIGNMENTS (for SITE_ADMIN role)
-- ============================================================================

CREATE TABLE admin_sites (
  admin_id         UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_id, site_id)
);

-- ============================================================================
-- OMADA CONTROLLERS
-- ============================================================================

CREATE TABLE omada_controllers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  -- URL may be blank if controller is on private LAN (uses site connector)
  controller_url      TEXT,
  omadac_id           TEXT,       -- Omada Cloud Controller ID
  username            TEXT,       -- stored encrypted in production
  -- password is stored in secrets manager / env; only reference stored here
  password_secret_ref TEXT,
  api_version         TEXT NOT NULL DEFAULT 'v5',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- If true, controller is reachable through a local site-connector agent
  use_site_connector  BOOLEAN NOT NULL DEFAULT FALSE,
  site_connector_url  TEXT,
  last_seen_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_controllers_site ON omada_controllers (site_id);

-- ============================================================================
-- ACCESS POINTS (informational; populated from Omada API or admin)
-- ============================================================================

CREATE TABLE access_points (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  controller_id    UUID REFERENCES omada_controllers(id) ON DELETE SET NULL,
  ap_mac           TEXT NOT NULL,
  name             TEXT,
  model            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ap_mac_site_unique UNIQUE (site_id, ap_mac)
);

CREATE INDEX idx_aps_site ON access_points (site_id);
CREATE INDEX idx_aps_mac ON access_points (ap_mac);

-- ============================================================================
-- SSID CONFIGURATIONS
-- ============================================================================

CREATE TABLE ssid_configurations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  controller_id    UUID REFERENCES omada_controllers(id) ON DELETE SET NULL,
  ssid_name        TEXT NOT NULL,
  vlan_id          INTEGER,
  portal_url       TEXT,          -- Omada portal redirect base URL
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ssid_site ON ssid_configurations (site_id);

-- ============================================================================
-- PACKAGES
-- ============================================================================

CREATE TABLE packages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  description      TEXT,
  duration_seconds INTEGER NOT NULL,  -- authoritative duration
  price_tzs        INTEGER NOT NULL,  -- price in Tanzanian Shillings (integer)
  status           package_status NOT NULL DEFAULT 'ACTIVE',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT packages_price_positive CHECK (price_tzs > 0),
  CONSTRAINT packages_duration_positive CHECK (duration_seconds > 0)
);

CREATE INDEX idx_packages_status ON packages (status);

-- ============================================================================
-- SITE ↔ PACKAGE ASSIGNMENT
-- ============================================================================

CREATE TABLE site_packages (
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  package_id       UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, package_id)
);

-- ============================================================================
-- PORTAL SESSIONS
-- ============================================================================

CREATE TABLE portal_sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Cryptographically signed opaque token stored in browser (short-lived)
  session_token_hash  TEXT NOT NULL,
  site_id             UUID REFERENCES sites(id) ON DELETE SET NULL,
  -- Omada captive portal parameters (captured server-side from redirect)
  client_mac          TEXT NOT NULL,
  ap_mac              TEXT NOT NULL,
  ssid_name           TEXT NOT NULL,
  radio_id            TEXT,
  vid                 TEXT,
  -- Store redirect URL validated at creation; never accepted from subsequent requests
  redirect_url        TEXT,
  -- Selected package (set when guest picks a package)
  selected_package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  status              portal_session_status NOT NULL DEFAULT 'CREATED',
  -- IP address of guest at session creation
  client_ip           INET,
  user_agent          TEXT,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_sessions_token_unique UNIQUE (session_token_hash)
);

CREATE INDEX idx_portal_sessions_token ON portal_sessions (session_token_hash);
CREATE INDEX idx_portal_sessions_client_mac ON portal_sessions (client_mac);
CREATE INDEX idx_portal_sessions_status ON portal_sessions (status);
CREATE INDEX idx_portal_sessions_expires ON portal_sessions (expires_at);

-- ============================================================================
-- PAYMENT TRANSACTIONS
-- ============================================================================

CREATE TABLE payment_transactions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Unique human-readable reference: WIFI-YYYYMMDD-XXXXXXXX
  reference               TEXT NOT NULL,
  site_id                 UUID REFERENCES sites(id) ON DELETE SET NULL,
  package_id              UUID REFERENCES packages(id) ON DELETE SET NULL,
  portal_session_id       UUID REFERENCES portal_sessions(id) ON DELETE SET NULL,
  -- Captured from portal session at payment creation time (immutable)
  client_mac              TEXT NOT NULL,
  ap_mac                  TEXT NOT NULL,
  ssid_name               TEXT NOT NULL,
  -- Phone number (E.164 format: 255XXXXXXXXX)
  phone_number            TEXT NOT NULL,
  -- Amount in TZS; must match package price at time of transaction creation
  amount_tzs              INTEGER NOT NULL,
  -- Provider transaction ID returned by MalipoPay
  malipopay_transaction_id TEXT,
  -- Full status lifecycle
  status                  transaction_status NOT NULL DEFAULT 'PENDING',
  -- Webhook idempotency: track if webhook has been processed
  webhook_processed_at    TIMESTAMPTZ,
  webhook_payload         JSONB,
  -- Error tracking
  error_code              TEXT,
  error_message           TEXT,
  -- Authorization timing
  authorized_at           TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,    -- when internet access should expire
  duration_seconds        INTEGER,        -- copied from package at creation time
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_reference_unique UNIQUE (reference),
  CONSTRAINT transactions_amount_positive CHECK (amount_tzs > 0)
);

CREATE INDEX idx_transactions_reference ON payment_transactions (reference);
CREATE INDEX idx_transactions_site ON payment_transactions (site_id);
CREATE INDEX idx_transactions_status ON payment_transactions (status);
CREATE INDEX idx_transactions_client_mac ON payment_transactions (client_mac);
CREATE INDEX idx_transactions_portal_session ON payment_transactions (portal_session_id);
CREATE INDEX idx_transactions_created ON payment_transactions (created_at DESC);
CREATE INDEX idx_transactions_malipopay_id ON payment_transactions (malipopay_transaction_id)
  WHERE malipopay_transaction_id IS NOT NULL;

-- ============================================================================
-- CLIENT AUTHORIZATIONS (Omada authorization records)
-- ============================================================================

CREATE TABLE client_authorizations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id      UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
  site_id             UUID REFERENCES sites(id) ON DELETE SET NULL,
  portal_session_id   UUID REFERENCES portal_sessions(id) ON DELETE SET NULL,
  -- Client identifiers (copied from transaction, immutable here)
  client_mac          TEXT NOT NULL,
  ap_mac              TEXT NOT NULL,
  ssid_name           TEXT NOT NULL,
  -- Authorization details
  status              authorization_status NOT NULL DEFAULT 'ACTIVE',
  duration_seconds    INTEGER NOT NULL,
  authorized_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  revoke_reason       TEXT,
  -- Omada API response (for debugging)
  omada_response      JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One active authorization per transaction
  CONSTRAINT auth_transaction_unique UNIQUE (transaction_id)
);

CREATE INDEX idx_auth_client_mac ON client_authorizations (client_mac);
CREATE INDEX idx_auth_status ON client_authorizations (status);
CREATE INDEX idx_auth_expires ON client_authorizations (expires_at);
CREATE INDEX idx_auth_transaction ON client_authorizations (transaction_id);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action          audit_action NOT NULL,
  -- Who performed the action (null for system/automated actions)
  admin_id        UUID REFERENCES admins(id) ON DELETE SET NULL,
  -- Related entities
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  transaction_id  UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  -- Structured details
  details         JSONB,
  -- Request metadata
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_action ON audit_logs (action);
CREATE INDEX idx_audit_admin ON audit_logs (admin_id);
CREATE INDEX idx_audit_site ON audit_logs (site_id);
CREATE INDEX idx_audit_transaction ON audit_logs (transaction_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_controllers_updated_at
  BEFORE UPDATE ON omada_controllers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_aps_updated_at
  BEFORE UPDATE ON access_points
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_portal_sessions_updated_at
  BEFORE UPDATE ON portal_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_auth_updated_at
  BEFORE UPDATE ON client_authorizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables (service role bypasses, anon key is restricted)
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE omada_controllers ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE ssid_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- All access goes through the service role key (server side only).
-- No public/anon policies intentionally - the anon key has no access.
-- Add policies here if you add Supabase Auth for admin users later.

-- ============================================================================
-- SEED: default packages
-- ============================================================================

INSERT INTO packages (id, name, description, duration_seconds, price_tzs, sort_order) VALUES
  (uuid_generate_v4(), '1 Hour',   'One hour of internet access',          3600,   1000, 1),
  (uuid_generate_v4(), '3 Hours',  'Three hours of internet access',       10800,  2000, 2),
  (uuid_generate_v4(), '12 Hours', 'Half day internet access',             43200,  4000, 3),
  (uuid_generate_v4(), '24 Hours', 'Full day internet access',             86400,  5000, 4);
