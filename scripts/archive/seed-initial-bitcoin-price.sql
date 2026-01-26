-- Seed initial Bitcoin price
-- Run this in Supabase SQL Editor to populate the first price
-- The cron job will take over after deployment

INSERT INTO bitcoin_prices (price, currency, source)
VALUES (98500.00, 'USD', 'manual_seed')
ON CONFLICT DO NOTHING;

-- Verify it was inserted
SELECT * FROM get_latest_bitcoin_price('USD');



