-- Withdrawal Security Enhancements Migration
-- Adds support for:
-- 1. Withdrawal limits (per-transaction and daily)
-- 2. Balance reconciliation
-- 3. Approval workflow for large withdrawals
-- 4. Enhanced audit logging

-- Add new status for pending approval
ALTER TABLE transactions 
DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_status_check 
CHECK (status IN ('pending', 'completed', 'failed', 'pending_approval', 'rejected'));

-- Add approval workflow and audit fields to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS process_after TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Create index for pending approvals
CREATE INDEX IF NOT EXISTS idx_transactions_pending_approval 
ON transactions(status, type) 
WHERE status = 'pending_approval' AND type = 'withdrawal';

-- Create index for process_after (for delayed withdrawals)
CREATE INDEX IF NOT EXISTS idx_transactions_process_after 
ON transactions(process_after) 
WHERE process_after IS NOT NULL AND status = 'pending';

-- Create withdrawal_audit_logs table for detailed audit trail
CREATE TABLE IF NOT EXISTS withdrawal_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  action VARCHAR NOT NULL CHECK (action IN (
    'initiated', 
    'limit_check_passed', 
    'limit_check_failed',
    'reconciliation_passed',
    'reconciliation_failed',
    'queued_for_approval',
    'delayed',
    'approved',
    'rejected',
    'processing',
    'completed',
    'failed'
  )),
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_audit_logs_transaction 
ON withdrawal_audit_logs(transaction_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_audit_logs_user 
ON withdrawal_audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_audit_logs_created 
ON withdrawal_audit_logs(created_at DESC);

-- Function to calculate user's balance from transaction history
CREATE OR REPLACE FUNCTION calculate_user_balance(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_calculated_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'deposit' AND status = 'completed' THEN amount
      WHEN type = 'withdrawal' AND status = 'completed' THEN -amount
      WHEN type = 'internal' AND status = 'completed' THEN amount -- internal can be positive or negative
      ELSE 0
    END
  ), 0)
  INTO v_calculated_balance
  FROM transactions
  WHERE user_id = p_user_id;
  
  RETURN v_calculated_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if balance reconciles
CREATE OR REPLACE FUNCTION check_balance_reconciliation(p_user_id UUID)
RETURNS TABLE(
  reconciles BOOLEAN,
  stored_balance BIGINT,
  calculated_balance BIGINT,
  discrepancy BIGINT
) AS $$
DECLARE
  v_stored_balance BIGINT;
  v_calculated_balance BIGINT;
BEGIN
  -- Get stored balance
  SELECT balance INTO v_stored_balance
  FROM profiles
  WHERE id = p_user_id;
  
  -- Calculate balance from transactions
  v_calculated_balance := calculate_user_balance(p_user_id);
  
  RETURN QUERY SELECT 
    (v_stored_balance = v_calculated_balance) AS reconciles,
    v_stored_balance AS stored_balance,
    v_calculated_balance AS calculated_balance,
    (v_stored_balance - v_calculated_balance) AS discrepancy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's daily withdrawal total
CREATE OR REPLACE FUNCTION get_daily_withdrawal_total(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'withdrawal'
    AND status IN ('completed', 'pending', 'pending_approval')
    AND created_at >= NOW() - INTERVAL '24 hours';
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_user_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_balance_reconciliation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_withdrawal_total(UUID) TO authenticated;

-- RLS for withdrawal_audit_logs
ALTER TABLE withdrawal_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs (via service role)
CREATE POLICY "Service role can manage withdrawal_audit_logs"
ON withdrawal_audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can see their own audit logs
CREATE POLICY "Users can view own withdrawal audit logs"
ON withdrawal_audit_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

