-- Storage RLS Policies for post-images bucket
-- This allows both authenticated and anonymous users to upload images

-- Enable RLS on the storage.objects table for the post-images bucket
-- (RLS should already be enabled by default in Supabase)

-- Policy 1: Allow anyone (including anonymous) to upload images
-- This allows INSERT operations for all users
-- Drop first if exists to avoid errors on re-run
DROP POLICY IF EXISTS "Allow public uploads to post-images" ON storage.objects;
CREATE POLICY "Allow public uploads to post-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'post-images'
);

-- Policy 2: Allow anyone to read/view images (SELECT)
-- This is needed to display images publicly
DROP POLICY IF EXISTS "Allow public reads from post-images" ON storage.objects;
CREATE POLICY "Allow public reads from post-images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'post-images'
);

-- Policy 3: Allow authenticated users to update their own images
-- This is useful if users want to replace images
DROP POLICY IF EXISTS "Allow authenticated users to update own images" ON storage.objects;
CREATE POLICY "Allow authenticated users to update own images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'post-images' AND
  (auth.uid()::text = (storage.foldername(name))[1] OR
   (storage.foldername(name))[1] = 'anonymous')
)
WITH CHECK (
  bucket_id = 'post-images' AND
  (auth.uid()::text = (storage.foldername(name))[1] OR
   (storage.foldername(name))[1] = 'anonymous')
);

-- Policy 4: Allow authenticated users to delete their own images
-- This is useful for cleanup operations
DROP POLICY IF EXISTS "Allow authenticated users to delete own images" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'post-images' AND
  (auth.uid()::text = (storage.foldername(name))[1] OR
   (storage.foldername(name))[1] = 'anonymous')
);

-- Note: The bucket structure is:
-- posts/{userId}/{timestamp}-{random}.jpg (for post images)
-- fixes/{userId}/{timestamp}-{random}.jpg (for fix images)
-- fixes/anonymous/{timestamp}-{random}.jpg (for anonymous fix images)

