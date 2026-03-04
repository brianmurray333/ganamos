-- Make image_url nullable to support image-less posts
-- This was missing from the original image-less posts feature (PR 63)
-- The has_image column (added in 20260226000000) tracks whether a post has an image

ALTER TABLE posts ALTER COLUMN image_url DROP NOT NULL;
