-- Preserve the complete Omada external-portal context through payment.
ALTER TABLE portal_sessions
  ADD COLUMN IF NOT EXISTS site_name TEXT,
  ADD COLUMN IF NOT EXISTS portal_timestamp TEXT,
  ADD COLUMN IF NOT EXISTS gateway_mac TEXT;
