-- ============================================================================
-- Migration: 007_multi_controller_support.sql
-- Description: Add multi-controller/multi-site architecture with encryption
-- ============================================================================

-- ============================================================================
-- 1. Update sites table to support primary controller routing
-- ============================================================================

ALTER TABLE sites ADD COLUMN IF NOT EXISTS primary_controller_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sites_primary_controller_id_fkey'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT sites_primary_controller_id_fkey
      FOREIGN KEY (primary_controller_id)
      REFERENCES omada_controllers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN sites.primary_controller_id IS 'Primary controller for this site. Used for default routing when apMac cannot be resolved.';

-- ============================================================================
-- 2. Enhance omada_controllers table with encryption and metadata
-- ============================================================================

-- Cloud Open API (Northbound) credentials - encrypted at rest
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS cloud_api_url TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS cloud_api_client_id TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS cloud_api_client_secret_ciphertext TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS cloud_api_omadac_id TEXT;

-- Controller API credentials - encrypted at rest
-- Use these for extPortal hotspot authorization
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS controller_id TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS controller_username_ciphertext TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS controller_password_ciphertext TEXT;

-- Health and monitoring
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS sync_status TEXT;
ALTER TABLE omada_controllers ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE omada_controllers ALTER COLUMN site_id DROP NOT NULL;

-- Add comments for clarity
COMMENT ON TABLE omada_controllers IS 'Omada controller configurations for multi-controller support. Credentials are encrypted at rest.';
COMMENT ON COLUMN omada_controllers.cloud_api_client_secret_ciphertext IS 'Encrypted Cloud Open API client secret. Never returned to browser in unencrypted form.';
COMMENT ON COLUMN omada_controllers.controller_password_ciphertext IS 'Encrypted hotspot operator password. Never returned to browser in unencrypted form.';

-- Create indexes for new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_omada_controllers_active ON omada_controllers(is_active);
CREATE INDEX IF NOT EXISTS idx_omada_controllers_synced_at ON omada_controllers(synced_at DESC);

-- ============================================================================
-- 3. Enhance access_points table with controller_id and omada_ap_id
-- ============================================================================

ALTER TABLE access_points ADD COLUMN IF NOT EXISTS omada_ap_id TEXT;

CREATE INDEX IF NOT EXISTS idx_access_points_controller_id ON access_points(controller_id);
CREATE INDEX IF NOT EXISTS idx_access_points_ap_mac ON access_points(ap_mac);

DROP INDEX IF EXISTS idx_sites_omada_site_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_controller_omada_site_id
  ON sites (primary_controller_id, omada_site_id)
  WHERE primary_controller_id IS NOT NULL AND omada_site_id IS NOT NULL;

-- ============================================================================
-- 4. Enhance portal_sessions with controller and access point tracking
-- ============================================================================

ALTER TABLE portal_sessions ADD COLUMN IF NOT EXISTS controller_id UUID REFERENCES omada_controllers(id) ON DELETE SET NULL;
ALTER TABLE portal_sessions ADD COLUMN IF NOT EXISTS access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_sessions_controller_id ON portal_sessions(controller_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_access_point_id ON portal_sessions(access_point_id);

-- ============================================================================
-- 5. Enhance payment_transactions with controller and access point tracking
-- ============================================================================

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS controller_id UUID REFERENCES omada_controllers(id) ON DELETE SET NULL;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL;

-- Add provenance columns for admin reporting
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS controller_name TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS ap_mac_resolved TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS ap_name TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS ap_model TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS omada_site_id_resolved TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS omada_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_controller_id ON payment_transactions(controller_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_access_point_id ON payment_transactions(access_point_id);

-- ============================================================================
-- 6. Enhance client_authorizations with controller and access point tracking
-- ============================================================================

ALTER TABLE client_authorizations ADD COLUMN IF NOT EXISTS controller_id UUID REFERENCES omada_controllers(id) ON DELETE SET NULL;
ALTER TABLE client_authorizations ADD COLUMN IF NOT EXISTS access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL;

-- Add provenance columns
ALTER TABLE client_authorizations ADD COLUMN IF NOT EXISTS controller_name TEXT;
ALTER TABLE client_authorizations ADD COLUMN IF NOT EXISTS ap_mac_resolved TEXT;
ALTER TABLE client_authorizations ADD COLUMN IF NOT EXISTS ap_name TEXT;

CREATE INDEX IF NOT EXISTS idx_client_authorizations_controller_id ON client_authorizations(controller_id);
CREATE INDEX IF NOT EXISTS idx_client_authorizations_access_point_id ON client_authorizations(access_point_id);

-- ============================================================================
-- 7. Enhance ssid_configurations with controller_id (already exists from 001, but ensure consistency)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ssid_configurations_controller_id ON ssid_configurations(controller_id);

-- ============================================================================
-- Helper: Validate encryption key is configured
-- ============================================================================

-- This is a documentation marker. Actual key validation happens at runtime in Node.js

COMMENT ON SCHEMA public IS 'Omada Portal Platform schema with multi-controller support. Credentials are encrypted using AES-256-GCM with key from OMADA_CREDENTIAL_ENCRYPTION_KEY environment variable.';
