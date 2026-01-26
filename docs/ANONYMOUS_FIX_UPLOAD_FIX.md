# Anonymous Fix Upload Issue - Fix Documentation

## Problem
Anonymous users were unable to submit fix photos for issues because:
1. The Supabase Storage bucket's Row Level Security (RLS) policies were too restrictive
2. RLS policies didn't allow anonymous (unauthenticated) uploads
3. This resulted in a 400 error: "Failed to upload fix image"

## Root Cause
The `post-images` storage bucket had RLS enabled but no policies allowing anonymous users to upload (INSERT) images. By default, when RLS is enabled without explicit policies, all operations are denied unless you're using the service role key.

## Solution
Add proper RLS policies to the storage bucket to allow anonymous uploads while maintaining security.

### Storage RLS Policies
Created SQL script to add four policies to the `post-images` bucket:

1. **Allow public uploads** - Lets anyone (including anonymous users) upload images
2. **Allow public reads** - Lets anyone view/download images (needed for displaying them)
3. **Allow authenticated users to update their own images** - Users can replace their images
4. **Allow authenticated users to delete their own images** - Users can clean up their images

These policies follow Supabase best practices and provide the right balance of security and functionality.

## Files Changed

### Created:
- `scripts/setup-storage-rls-policies.sql` - SQL script to set up storage RLS policies

### No Code Changes Required:
The existing upload code in `app/post/[id]/page.tsx` already works correctly - it was just being blocked by missing RLS policies.

## Deployment Steps

### 1. Apply Storage RLS Policies
Run the SQL script in your Supabase SQL Editor (for both staging and production):

```bash
# In Supabase Dashboard → SQL Editor → New Query
# Paste contents of scripts/setup-storage-rls-policies.sql
# Click "Run"
```

Or via CLI:
```bash
supabase db execute --file scripts/setup-storage-rls-policies.sql
```

### 2. Verify Policies Are Applied
In Supabase Dashboard:
1. Go to Storage → post-images bucket
2. Click "Policies" tab
3. Verify you see 4 policies listed

### 3. Test Anonymous Upload
1. Open the app in an incognito window (not logged in)
2. Navigate to any issue post
3. Click "Submit Fix"
4. Take/upload a photo
5. Verify the upload succeeds

## Testing Checklist
- [ ] Storage RLS policies applied successfully
- [ ] Anonymous user can submit a fix photo
- [ ] Image uploads successfully to storage
- [ ] Image displays correctly in the post after submission
- [ ] Logged-in users can still submit fixes (ensure no regression)
- [ ] Image URLs are publicly accessible
- [ ] Anonymous user cannot delete/update other users' images

## Security Considerations

### What This Allows:
✅ Anyone can upload images (anonymous or authenticated)
✅ Anyone can view images (needed for public display)
✅ Authenticated users can update/delete their own images

### What This Prevents:
❌ Anonymous users cannot update or delete ANY images
❌ Authenticated users cannot update/delete others' images
❌ Service role key still not needed in client code

### Why This Is Safe:
- Uploads are to specific folder structures (`posts/{userId}/` or `fixes/anonymous/`)
- File paths include timestamps and random strings to prevent collisions
- Images are validated by the app before upload
- Storage bucket has reasonable size limits
- Database tracks which images are associated with which posts

## Alternative Approaches Considered

### ❌ Server-side API Endpoint with Service Role Key
- **Pros**: Bypass RLS completely
- **Cons**: 
  - More code to maintain
  - Slower (extra API hop)
  - Not following Supabase best practices
  - RLS exists for this exact purpose

### ✅ RLS Policies (Chosen Approach)
- **Pros**:
  - Simple, clean solution
  - Fast direct uploads from browser
  - Following Supabase best practices
  - Declarative security model
  - Easy to audit and modify
- **Cons**: 
  - None significant

## Additional Notes
- No code changes required - just database policy updates
- No new environment variables needed
- Works for both anonymous and authenticated users
- Images stored in same location: `fixes/anonymous/{timestamp}-{random}.jpg`
- No database schema changes required

