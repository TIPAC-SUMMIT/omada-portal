-- ============================================================================
-- Migration: 003_vouchers.sql
-- Voucher system for TIPAC SUMMIT Wi-Fi portal
-- ============================================================================

-- Voucher batches (admin uploads a batch of codes per site + package tier)
CREATE TABLE voucher_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,                    -- e.g. "Batch Aug 2026 - 200TZS"
  price_tzs       INTEGER NOT NULL,                 -- 200, 500, or 1000
  duration_seconds INTEGER NOT NULL,                -- 420, 21600, or 86400
  total_count     INTEGER NOT NULL DEFAULT 0,
  used_count      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voucher_batch_price_positive CHECK (price_tzs > 0)
);

CREATE INDEX idx_voucher_batches_site ON voucher_batches (site_id);

CREATE TRIGGER trg_voucher_batches_updated_at
  BEFORE UPDATE ON voucher_batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Individual voucher codes
CREATE TABLE vouchers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id        UUID NOT NULL REFERENCES voucher_batches(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  code            TEXT NOT NULL,                    -- the actual voucher code from Omada
  price_tzs       INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  is_used         BOOLEAN NOT NULL DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  -- Transaction that purchased this voucher
  transaction_id  UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  -- Client who used it
  client_mac      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vouchers_code_site_unique UNIQUE (site_id, code)
);

CREATE INDEX idx_vouchers_batch ON vouchers (batch_id);
CREATE INDEX idx_vouchers_site ON vouchers (site_id);
CREATE INDEX idx_vouchers_code ON vouchers (code);
CREATE INDEX idx_vouchers_unused ON vouchers (site_id, is_used) WHERE is_used = FALSE;
CREATE INDEX idx_vouchers_transaction ON vouchers (transaction_id);

-- Enable RLS
ALTER TABLE voucher_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
