-- ============================================================================
-- Migration: 002_transaction_constraints.sql
-- Additional constraints to enforce transaction state machine integrity
-- ============================================================================

-- Prevent webhook_processed_at from being set for non-terminal statuses
-- (enforced at application level too, but belt-and-suspenders)
ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_webhook_processed_status
  CHECK (
    webhook_processed_at IS NULL OR
    status IN ('PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_TIMEOUT', 'AUTHORIZED', 'AUTHORIZATION_FAILED', 'EXPIRED')
  );

-- expires_at must be set when status is AUTHORIZED
ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_authorized_has_expiry
  CHECK (
    status != 'AUTHORIZED' OR expires_at IS NOT NULL
  );

-- Unique constraint: one non-failed transaction per portal session
-- (prevents submitting multiple simultaneous payment requests for same session)
CREATE UNIQUE INDEX idx_transactions_active_per_session
  ON payment_transactions (portal_session_id)
  WHERE status NOT IN ('PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_TIMEOUT', 'EXPIRED');
