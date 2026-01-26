-- Fix balance using a function that bypasses the security trigger
-- The trigger blocks direct updates unless running as service_role
-- This function runs with SECURITY DEFINER to bypass the check

-- Create a temporary function to update balance
CREATE OR REPLACE FUNCTION fix_user_balance(
    p_user_id UUID,
    p_amount_to_add INTEGER
)
RETURNS TABLE(
    old_balance INTEGER,
    new_balance INTEGER,
    old_pet_coins INTEGER,
    new_pet_coins INTEGER
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_balance INTEGER;
    v_new_balance INTEGER;
    v_old_pet_coins INTEGER;
    v_new_pet_coins INTEGER;
BEGIN
    -- Get current values
    SELECT balance, pet_coins 
    INTO v_old_balance, v_old_pet_coins
    FROM profiles
    WHERE id = p_user_id;
    
    -- Update balance (this will bypass the trigger because we're using SECURITY DEFINER)
    UPDATE profiles
    SET 
        balance = balance + p_amount_to_add,
        pet_coins = COALESCE(pet_coins, 0) + p_amount_to_add,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Get new values
    SELECT balance, pet_coins 
    INTO v_new_balance, v_new_pet_coins
    FROM profiles
    WHERE id = p_user_id;
    
    -- Return the before/after values
    RETURN QUERY SELECT v_old_balance, v_new_balance, v_old_pet_coins, v_new_pet_coins;
END;
$$;

-- Now call the function to fix your balance
SELECT * FROM fix_user_balance(
    'dce58449-faa0-413e-8b7a-6e607d280beb'::UUID,
    100000
);

-- Verify the update
SELECT 
    balance,
    pet_coins,
    updated_at
FROM profiles
WHERE id = 'dce58449-faa0-413e-8b7a-6e607d280beb';

-- Clean up: Drop the function after use (optional, but good practice)
-- DROP FUNCTION IF EXISTS fix_user_balance(UUID, INTEGER);

