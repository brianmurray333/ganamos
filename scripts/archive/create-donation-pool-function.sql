-- Create function to increment donation pool totals
CREATE OR REPLACE FUNCTION increment_donation_pool(pool_id uuid, amount integer)
RETURNS void AS $$
BEGIN
  UPDATE donation_pools 
  SET 
    total_donated = COALESCE(total_donated, 0) + amount,
    current_balance = COALESCE(current_balance, 0) + amount,
    updated_at = NOW()
  WHERE id = pool_id;
END;
$$ LANGUAGE plpgsql;
