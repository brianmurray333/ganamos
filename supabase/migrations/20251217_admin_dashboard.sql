-- Admin Dashboard Migration
-- Adds tables and columns needed for the admin dashboard

-- Add status columns to pet_orders if they don't exist
DO $$ 
BEGIN
  -- Add status column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pet_orders' AND column_name = 'status') THEN
    ALTER TABLE pet_orders ADD COLUMN status TEXT DEFAULT 'pending';
  END IF;
  
  -- Add shipped_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pet_orders' AND column_name = 'shipped_at') THEN
    ALTER TABLE pet_orders ADD COLUMN shipped_at TIMESTAMPTZ;
  END IF;
  
  -- Add tracking_number column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pet_orders' AND column_name = 'tracking_number') THEN
    ALTER TABLE pet_orders ADD COLUMN tracking_number TEXT;
  END IF;
END $$;

-- Create admin PR log table
CREATE TABLE IF NOT EXISTS admin_pr_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number INTEGER NOT NULL UNIQUE,
  pr_url TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  author TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  merged_at TIMESTAMPTZ
);

-- Add unique constraint if table already exists without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admin_pr_log_pr_number_key'
  ) THEN
    ALTER TABLE admin_pr_log ADD CONSTRAINT admin_pr_log_pr_number_key UNIQUE (pr_number);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Create admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_pr_log_created_at ON admin_pr_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_pr_log_status ON admin_pr_log(status);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pet_orders_status ON pet_orders(status);

-- Add comment
COMMENT ON TABLE admin_pr_log IS 'Log of GitHub pull requests tracked via webhook';
COMMENT ON TABLE admin_audit_log IS 'Audit log of admin actions';

