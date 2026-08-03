-- Canonical atomic post creation for web and native clients.
-- Creates the post, reserves any reward, records the ledger entry, and creates
-- activity in one database transaction.

CREATE OR REPLACE FUNCTION public.create_post_atomic(
  p_post_id UUID,
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_image_url TEXT DEFAULT NULL,
  p_has_image BOOLEAN DEFAULT FALSE,
  p_location TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_reward INTEGER DEFAULT 0,
  p_group_id UUID DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT NULL,
  p_created_by_avatar TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
  v_reward_allowed BOOLEAN;
  v_live_allowed BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authenticated';
  END IF;

  IF p_post_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Post ID and user ID are required';
  END IF;

  IF v_actor_id <> p_user_id AND NOT EXISTS (
    SELECT 1 FROM public.connected_accounts ca
    WHERE ca.primary_user_id = v_actor_id AND ca.connected_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Unauthorized account';
  END IF;

  IF NULLIF(BTRIM(p_title), '') IS NULL OR NULLIF(BTRIM(p_description), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Title and description are required';
  END IF;

  IF p_reward < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Reward cannot be negative';
  END IF;

  SELECT allowed INTO v_live_allowed FROM public.check_live_posts_cap() LIMIT 1;
  IF COALESCE(v_live_allowed, TRUE) = FALSE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The live post limit has been reached';
  END IF;

  IF p_reward > 0 THEN
    SELECT allowed INTO v_reward_allowed
    FROM public.check_post_reward_cap(p_user_id, p_reward) LIMIT 1;
    IF COALESCE(v_reward_allowed, TRUE) = FALSE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Post reward exceeds the maximum allowed amount';
    END IF;

    SELECT balance INTO v_balance
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'User profile not found';
    END IF;
    IF v_balance < p_reward THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Insufficient balance';
    END IF;
    v_new_balance := v_balance - p_reward;
  ELSE
    SELECT balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'User profile not found';
    END IF;
    v_new_balance := v_balance;
  END IF;

  INSERT INTO public.posts (
    id, user_id, created_by, created_by_avatar, title, description,
    image_url, has_image, location, latitude, longitude, reward,
    claimed, fixed, group_id, assigned_to, city, is_anonymous, expires_at
  ) VALUES (
    p_post_id, p_user_id, p_created_by, p_created_by_avatar,
    BTRIM(p_title), BTRIM(p_description), p_image_url, p_has_image,
    NULLIF(BTRIM(p_location), ''), p_latitude, p_longitude, p_reward,
    FALSE, FALSE, p_group_id, p_assigned_to, NULLIF(BTRIM(p_city), ''),
    FALSE, p_expires_at
  );

  IF p_reward > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, memo)
    VALUES (p_user_id, 'internal', -p_reward, 'completed',
      COALESCE(NULLIF(BTRIM(p_memo), ''), 'Post reward for issue'))
    RETURNING id INTO v_transaction_id;

    UPDATE public.profiles
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_user_id AND balance = v_balance;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Balance changed concurrently; please retry';
    END IF;
  END IF;

  INSERT INTO public.activities (
    id, user_id, type, related_id, related_table, timestamp, metadata
  ) VALUES (
    gen_random_uuid(), p_user_id, 'post', p_post_id, 'posts', NOW(),
    jsonb_strip_nulls(jsonb_build_object(
      'title', COALESCE(NULLIF(BTRIM(p_memo), ''), BTRIM(p_title)),
      'reward', p_reward, 'transaction_id', v_transaction_id
    ))
  );

  RETURN jsonb_build_object(
    'success', TRUE, 'post_id', p_post_id,
    'transaction_id', v_transaction_id, 'new_balance', v_new_balance
  );
END;
$$;

-- Preserve the client-side balance guard while allowing audited, owner-run
-- SECURITY DEFINER functions to perform trusted balance mutations. Direct
-- authenticated updates still run as `authenticator` and remain blocked.
CREATE OR REPLACE FUNCTION public.prevent_direct_balance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.balance IS NOT DISTINCT FROM NEW.balance
     AND OLD.pet_coins IS NOT DISTINCT FROM NEW.pet_coins THEN
    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'service_role')
     OR COALESCE(NULLIF(current_setting('request.jwt.claims', TRUE), '')::jsonb->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE WARNING 'SECURITY: Blocked balance update. User: %, Attempted: % -> %',
    auth.uid(), OLD.balance, NEW.balance;
  NEW.balance := OLD.balance;
  NEW.pet_coins := OLD.pet_coins;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_post_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_post_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.create_post_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, INTEGER, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) IS 'Atomically creates a post and reserves its reward for the authenticated user or an authorized connected account.';
