-- Create bitcoin_prices table for caching Bitcoin price data
-- This reduces API calls to CoinMarketCap and improves performance

CREATE TABLE IF NOT EXISTS bitcoin_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price decimal NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'coinmarketcap',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index on created_at for efficient historical queries
CREATE INDEX IF NOT EXISTS idx_bitcoin_prices_created_at ON bitcoin_prices(created_at DESC);

-- Create index on currency for multi-currency support (future)
CREATE INDEX IF NOT EXISTS idx_bitcoin_prices_currency ON bitcoin_prices(currency);

-- Enable Row Level Security
ALTER TABLE bitcoin_prices ENABLE ROW LEVEL SECURITY;

-- Allow public read access (no authentication needed)
-- Bitcoin price is public information
CREATE POLICY "Bitcoin prices are publicly readable"
  ON bitcoin_prices
  FOR SELECT
  TO public
  USING (true);

-- Only allow service role to insert/update prices
-- This will be done by the cron job
CREATE POLICY "Service role can insert bitcoin prices"
  ON bitcoin_prices
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update bitcoin prices"
  ON bitcoin_prices
  FOR UPDATE
  TO service_role
  USING (true);

-- Create a function to get the latest Bitcoin price
CREATE OR REPLACE FUNCTION get_latest_bitcoin_price(p_currency text DEFAULT 'USD')
RETURNS TABLE (
  price decimal,
  currency text,
  source text,
  created_at timestamptz,
  age_minutes integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bp.price,
    bp.currency,
    bp.source,
    bp.created_at,
    EXTRACT(EPOCH FROM (now() - bp.created_at))::integer / 60 as age_minutes
  FROM bitcoin_prices bp
  WHERE bp.currency = p_currency
  ORDER BY bp.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to public
GRANT EXECUTE ON FUNCTION get_latest_bitcoin_price(text) TO public;

-- Create a function to clean up old price history (optional, keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_bitcoin_prices()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM bitcoin_prices
  WHERE created_at < now() - interval '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role only
GRANT EXECUTE ON FUNCTION cleanup_old_bitcoin_prices() TO service_role;

COMMENT ON TABLE bitcoin_prices IS 'Cached Bitcoin price data updated every 30 minutes to reduce API calls';
COMMENT ON FUNCTION get_latest_bitcoin_price IS 'Returns the most recent Bitcoin price with age in minutes';
COMMENT ON FUNCTION cleanup_old_bitcoin_prices IS 'Deletes Bitcoin price records older than 30 days';

