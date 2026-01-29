-- Migration: Add Safety Caps
-- Created: 2026-01-29
-- Purpose: Add configurable safety limits to prevent runaway balances/rewards/posts
--
-- Caps:
--   Balance: 20k soft (warn), 40k hard (block deposits only - earnings always allowed)
--   Rewards: 5k soft (warn), 10k hard (block)
--   Live posts: 200 system-wide
--
-- Grandfathering: Users created before this migration runs are exempt

-- ============================================================================
-- 1. Add safety cap columns to existing system_settings table
-- ============================================================================
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS balance_cap_soft INTEGER DEFAULT 20000,
  ADD COLUMN IF NOT EXISTS balance_cap_hard INTEGER DEFAULT 40000,
  ADD COLUMN IF NOT EXISTS reward_cap_soft INTEGER DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS reward_cap_hard INTEGER DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS live_posts_cap INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS grandfathered_cutoff TIMESTAMPTZ DEFAULT NOW();

-- Ensure the main row has these values set
UPDATE system_settings 
SET 
  balance_cap_soft = COALESCE(balance_cap_soft, 20000),
  balance_cap_hard = COALESCE(balance_cap_hard, 40000),
  reward_cap_soft = COALESCE(reward_cap_soft, 5000),
  reward_cap_hard = COALESCE(reward_cap_hard, 10000),
  live_posts_cap = COALESCE(live_posts_cap, 200),
  grandfathered_cutoff = COALESCE(grandfathered_cutoff, NOW())
WHERE id = 'main';

-- ============================================================================
-- 2. Add cap tracking columns to existing submission_rate_limits table
-- ============================================================================
ALTER TABLE submission_rate_limits
  ADD COLUMN IF NOT EXISTS cap_type TEXT,
  ADD COLUMN IF NOT EXISTS cap_value_attempted INTEGER,
  ADD COLUMN IF NOT EXISTS cap_limit INTEGER,
  ADD COLUMN IF NOT EXISTS violation_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_submission_rate_limits_cap_type 
  ON submission_rate_limits(cap_type) WHERE cap_type IS NOT NULL;

-- ============================================================================
-- 3. Helper: Check if user is grandfathered (created before cutoff)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_user_grandfathered(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_created_at TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
BEGIN
  SELECT created_at INTO v_user_created_at FROM profiles WHERE id = p_user_id;
  SELECT grandfathered_cutoff INTO v_cutoff FROM system_settings WHERE id = 'main';
  
  IF v_cutoff IS NULL THEN RETURN FALSE; END IF;
  RETURN COALESCE(v_user_created_at < v_cutoff, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. Check balance cap (soft 20k, hard 40k)
--    p_is_earning = TRUE means user earned sats (job completion) - NEVER block
--    p_is_earning = FALSE means deposit - can be blocked at hard cap
-- ============================================================================
CREATE OR REPLACE FUNCTION check_balance_cap(
  p_user_id UUID,
  p_new_balance INTEGER,
  p_is_earning BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(allowed BOOLEAN, cap_level TEXT, violation_id UUID) AS $$
DECLARE
  v_soft INTEGER;
  v_hard INTEGER;
  v_vid UUID;
BEGIN
  -- Grandfathered users exempt
  IF is_user_grandfathered(p_user_id) THEN
    RETURN QUERY SELECT TRUE, 'none'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  SELECT balance_cap_soft, balance_cap_hard INTO v_soft, v_hard
  FROM system_settings WHERE id = 'main';
  
  -- No caps configured
  IF v_soft IS NULL AND v_hard IS NULL THEN
    RETURN QUERY SELECT TRUE, 'none'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Hard cap check (deposits only - earnings always pass)
  IF v_hard IS NOT NULL AND p_new_balance > v_hard AND NOT p_is_earning THEN
    INSERT INTO submission_rate_limits (user_id, submission_count, flagged, flagged_at, cap_type, cap_value_attempted, cap_limit, violation_metadata)
    VALUES (p_user_id, 1, TRUE, NOW(), 'balance_hard', p_new_balance, v_hard, jsonb_build_object('is_earning', p_is_earning))
    RETURNING id INTO v_vid;
    RETURN QUERY SELECT FALSE, 'hard'::TEXT, v_vid;
    RETURN;
  END IF;
  
  -- Soft cap check (warn but allow)
  IF v_soft IS NOT NULL AND p_new_balance > v_soft THEN
    INSERT INTO submission_rate_limits (user_id, submission_count, flagged, flagged_at, cap_type, cap_value_attempted, cap_limit, violation_metadata)
    VALUES (p_user_id, 1, TRUE, NOW(), 'balance_soft', p_new_balance, v_soft, jsonb_build_object('is_earning', p_is_earning))
    RETURNING id INTO v_vid;
    RETURN QUERY SELECT TRUE, 'soft'::TEXT, v_vid;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT TRUE, 'none'::TEXT, NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Check post reward cap (soft 5k, hard 10k)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_post_reward_cap(
  p_user_id UUID,
  p_reward_amount INTEGER
)
RETURNS TABLE(allowed BOOLEAN, cap_level TEXT, violation_id UUID) AS $$
DECLARE
  v_soft INTEGER;
  v_hard INTEGER;
  v_vid UUID;
BEGIN
  IF is_user_grandfathered(p_user_id) THEN
    RETURN QUERY SELECT TRUE, 'none'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  SELECT reward_cap_soft, reward_cap_hard INTO v_soft, v_hard
  FROM system_settings WHERE id = 'main';
  
  IF v_soft IS NULL AND v_hard IS NULL THEN
    RETURN QUERY SELECT TRUE, 'none'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  -- Hard cap - block post creation
  IF v_hard IS NOT NULL AND p_reward_amount > v_hard THEN
    INSERT INTO submission_rate_limits (user_id, submission_count, flagged, flagged_at, cap_type, cap_value_attempted, cap_limit)
    VALUES (p_user_id, 1, TRUE, NOW(), 'reward_hard', p_reward_amount, v_hard)
    RETURNING id INTO v_vid;
    RETURN QUERY SELECT FALSE, 'hard'::TEXT, v_vid;
    RETURN;
  END IF;
  
  -- Soft cap - warn but allow
  IF v_soft IS NOT NULL AND p_reward_amount > v_soft THEN
    INSERT INTO submission_rate_limits (user_id, submission_count, flagged, flagged_at, cap_type, cap_value_attempted, cap_limit)
    VALUES (p_user_id, 1, TRUE, NOW(), 'reward_soft', p_reward_amount, v_soft)
    RETURNING id INTO v_vid;
    RETURN QUERY SELECT TRUE, 'soft'::TEXT, v_vid;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT TRUE, 'none'::TEXT, NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Check system-wide live posts cap (200 total across ALL users)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_live_posts_cap()
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, limit_value INTEGER, violation_id UUID) AS $$
DECLARE
  v_cap INTEGER;
  v_count INTEGER;
  v_vid UUID;
BEGIN
  SELECT live_posts_cap INTO v_cap FROM system_settings WHERE id = 'main';
  
  IF v_cap IS NULL THEN
    RETURN QUERY SELECT TRUE, 0, NULL::INTEGER, NULL::UUID;
    RETURN;
  END IF;
  
  -- Count unfixed, non-deleted posts
  SELECT COUNT(*) INTO v_count
  FROM posts
  WHERE fixed = FALSE AND deleted_at IS NULL;
  
  IF v_count >= v_cap THEN
    INSERT INTO submission_rate_limits (submission_count, flagged, flagged_at, cap_type, cap_value_attempted, cap_limit, violation_metadata)
    VALUES (1, TRUE, NOW(), 'live_posts_system', v_count + 1, v_cap, jsonb_build_object('current_count', v_count))
    RETURNING id INTO v_vid;
    RETURN QUERY SELECT FALSE, v_count, v_cap, v_vid;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT TRUE, v_count, v_cap, NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Documentation
-- ============================================================================
COMMENT ON COLUMN system_settings.balance_cap_soft IS 'Soft balance cap in sats (warn but allow). NULL to disable.';
COMMENT ON COLUMN system_settings.balance_cap_hard IS 'Hard balance cap in sats (block deposits, earnings always allowed). NULL to disable.';
COMMENT ON COLUMN system_settings.reward_cap_soft IS 'Soft post reward cap in sats (warn). NULL to disable.';
COMMENT ON COLUMN system_settings.reward_cap_hard IS 'Hard post reward cap in sats (block). NULL to disable.';
COMMENT ON COLUMN system_settings.live_posts_cap IS 'System-wide max unfixed posts. NULL to disable.';
COMMENT ON COLUMN system_settings.grandfathered_cutoff IS 'Users created before this are exempt from all caps.';
