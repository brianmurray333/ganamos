-- Add has_image column to posts table to track whether a post includes an image
-- This enables text-only post creation with placeholder images

-- Add column with default TRUE (existing posts are assumed to have images)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS has_image BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill: posts with a null or empty image_url should be marked false
UPDATE posts SET has_image = FALSE WHERE image_url IS NULL OR image_url = '';
