-- Add standardized location fields to posts table
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS locality TEXT,
ADD COLUMN IF NOT EXISTS admin_area_1 TEXT,
ADD COLUMN IF NOT EXISTS admin_area_2 TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Create indexes for efficient location queries
CREATE INDEX IF NOT EXISTS idx_posts_locality ON posts(locality) WHERE locality IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_admin_area_1 ON posts(admin_area_1) WHERE admin_area_1 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_country ON posts(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_fixed_locality ON posts(fixed, locality) WHERE locality IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_fixed_admin_area_1 ON posts(fixed, admin_area_1) WHERE admin_area_1 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_fixed_country ON posts(fixed, country) WHERE country IS NOT NULL;

-- Add comment explaining the new fields
COMMENT ON COLUMN posts.locality IS 'City/town name from Google geocoding (locality)';
COMMENT ON COLUMN posts.admin_area_1 IS 'State/province/prefecture from Google geocoding (administrative_area_level_1)';
COMMENT ON COLUMN posts.admin_area_2 IS 'County/district from Google geocoding (administrative_area_level_2)';
COMMENT ON COLUMN posts.country IS 'Country name from Google geocoding';
COMMENT ON COLUMN posts.country_code IS 'ISO country code from Google geocoding';
