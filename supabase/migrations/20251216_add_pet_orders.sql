-- Pet Orders Table for Satoshi Pet pre-orders
-- Stores order information for Lightning-paid device purchases

CREATE TABLE IF NOT EXISTS pet_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(20) NOT NULL UNIQUE, -- Human-readable order number like "SP-ABC123"
  
  -- Customer Information
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  
  -- Shipping Address (US only for now)
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL, -- US state code
  postal_code VARCHAR(20) NOT NULL,
  country VARCHAR(2) NOT NULL DEFAULT 'US',
  
  -- Pricing (in sats)
  device_price_sats INTEGER NOT NULL, -- Base price (40000 for pre-order)
  shipping_price_sats INTEGER NOT NULL, -- Shipping cost
  total_price_sats INTEGER NOT NULL, -- Total = device + shipping
  
  -- USD values at time of order (for reference)
  device_price_usd DECIMAL(10, 2),
  shipping_price_usd DECIMAL(10, 2),
  total_price_usd DECIMAL(10, 2),
  bitcoin_price_usd DECIMAL(10, 2), -- BTC/USD rate at time of order
  
  -- Lightning Payment
  payment_request TEXT, -- BOLT11 invoice
  payment_hash VARCHAR(64), -- r_hash for tracking
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'expired', 'failed')),
  paid_at TIMESTAMPTZ,
  
  -- Order Status
  order_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  shipped_at TIMESTAMPTZ,
  tracking_number VARCHAR(100),
  tracking_carrier VARCHAR(50),
  
  -- Metadata
  is_preorder BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_pet_orders_order_number ON pet_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_pet_orders_email ON pet_orders(email);
CREATE INDEX IF NOT EXISTS idx_pet_orders_payment_hash ON pet_orders(payment_hash);
CREATE INDEX IF NOT EXISTS idx_pet_orders_payment_status ON pet_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_pet_orders_order_status ON pet_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_pet_orders_created_at ON pet_orders(created_at DESC);

-- Enable RLS
ALTER TABLE pet_orders ENABLE ROW LEVEL SECURITY;

-- Policy: Allow backend to insert orders (uses service role)
CREATE POLICY pet_orders_insert ON pet_orders
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow backend to update orders (uses service role)
CREATE POLICY pet_orders_update ON pet_orders
  FOR UPDATE
  USING (true);

-- Policy: Allow public to view their own orders by email (for confirmation page)
-- Note: In production, you might want to add more authentication
CREATE POLICY pet_orders_select ON pet_orders
  FOR SELECT
  USING (true);

-- Add comment
COMMENT ON TABLE pet_orders IS 'Stores Satoshi Pet device pre-orders and purchases paid via Lightning';

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(20) AS $$
DECLARE
  new_order_number VARCHAR(20);
  chars VARCHAR(36) := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Removed confusing chars like 0/O, 1/I/L
  i INTEGER;
BEGIN
  -- Format: SP-XXXXXX (where X is alphanumeric)
  new_order_number := 'SP-';
  FOR i IN 1..6 LOOP
    new_order_number := new_order_number || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN new_order_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order number on insert
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    -- Try to generate a unique order number (retry up to 10 times)
    FOR i IN 1..10 LOOP
      NEW.order_number := generate_order_number();
      -- Check if it's unique
      IF NOT EXISTS (SELECT 1 FROM pet_orders WHERE order_number = NEW.order_number) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON pet_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pet_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pet_orders_updated_at
  BEFORE UPDATE ON pet_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_pet_orders_updated_at();

