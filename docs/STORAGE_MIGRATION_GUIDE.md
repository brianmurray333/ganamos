# 🚀 Image Storage Migration Guide

This guide will help you migrate from storing images as base64 in the database to using Supabase Storage.

## 📊 Expected Impact

- **Database query size**: 2.4 MB → ~20 KB (99% reduction)
- **Page load time**: ~900ms faster
- **Image caching**: Browser can now cache images
- **Bandwidth savings**: Massive reduction in data transfer

## 🛠️ What's Been Done

✅ Created storage helper functions (`lib/storage.ts`)  
✅ Updated post creation to upload to storage  
✅ Updated fix submission to upload to storage  
✅ Created setup script for storage bucket  
✅ Created migration script for existing images  

## 📝 Steps to Complete Migration

### Step 1: Get Your Service Role Key

1. Go to your Supabase Dashboard
2. Navigate to **Settings** → **API**
3. Copy your **Service Role Key** (keep this secret!)
4. Add it to your `.env.local` file:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Step 2: Install Required Dependency

The scripts need the `tsx` package to run TypeScript directly:

```bash
npm install --save-dev tsx
```

### Step 3: Set Up Storage Bucket

Run the setup script to create the storage bucket:

```bash
npx tsx scripts/setup-storage-bucket.ts
```

This will:
- Create a `post-images` bucket in Supabase Storage
- Display the policies you need to add manually

### Step 4: Add Storage Policies

1. Go to **Supabase Dashboard** → **Storage** → **post-images** → **Policies**
2. Click **New Policy** and add these 4 policies:

**Policy 1: Public Read Access**
- Name: `Public read access`
- Allowed operations: SELECT
- Policy definition: `true`
- Target roles: `public`

**Policy 2: Authenticated Upload**
- Name: `Authenticated users can upload`
- Allowed operations: INSERT
- Policy definition: `auth.role() = 'authenticated'`
- Target roles: `authenticated`

**Policy 3: Users Update Own Images**
- Name: `Users can update own images`
- Allowed operations: UPDATE
- Policy definition: `(storage.foldername(name))[1] = auth.uid()::text`
- Target roles: `authenticated`

**Policy 4: Users Delete Own Images**
- Name: `Users can delete own images`
- Allowed operations: DELETE
- Policy definition: `(storage.foldername(name))[1] = auth.uid()::text`
- Target roles: `authenticated`

### Step 5: Test with New Posts

Before migrating existing data, test that new posts work:

1. Start your dev server: `npm run dev`
2. Create a new post with an image
3. Check the Network tab - image should upload to storage
4. Verify the post displays correctly

### Step 6: Migrate Existing Images

Once you've confirmed new posts work, migrate your existing images:

```bash
npx tsx scripts/migrate-images-to-storage.ts
```

This script will:
- Find all posts with base64 images
- Upload them to Supabase Storage
- Update the database with new URLs
- Process in batches to avoid rate limits

**⚠️ Important Notes:**
- The script is idempotent (safe to run multiple times)
- It skips images that are already migrated
- Monitor the console output for any errors
- For large databases, this might take 10-30 minutes

### Step 7: Verify Migration

After migration completes:

1. Refresh your dashboard
2. Check that posts display images correctly
3. Look at the Network tab - images should load from storage URLs
4. Verify posts query is now much smaller (~20 KB instead of 2.4 MB)

## 💰 Cost Considerations

### Supabase Storage Pricing (as of 2024)

**Free Tier:**
- 1 GB storage
- 2 GB bandwidth/month

**Pro Plan ($25/month):**
- 100 GB storage included
- 200 GB bandwidth included
- $0.021/GB for extra storage
- $0.09/GB for extra bandwidth

### Comparison

**Current (base64 in database):**
- Every query transfers full images
- 2.4 MB per 5 posts
- Counts against database egress
- No caching

**With Storage:**
- Initial query: ~20 KB (just URLs)
- Images: Separate CDN requests
- Browser caching saves repeated downloads
- Only unique images count toward bandwidth

**Example:** If you have 1000 posts with images:
- **Before**: Every page load transfers 480 MB (1000 posts ÷ 5 posts per page × 2.4 MB)
- **After**: First load ~500 MB total, subsequent loads mostly cached

## 🔧 Troubleshooting

### Issue: "Bucket already exists" error
**Solution**: This is fine! The script detects existing buckets. Just proceed to the policy setup.

### Issue: Upload fails with "403 Forbidden"
**Solution**: Check that you've added all 4 storage policies correctly.

### Issue: Migration script times out
**Solution**: The script processes in batches. If it stops, just run it again - it will skip already-migrated images.

### Issue: Images don't display after migration
**Solution**: 
1. Check browser console for errors
2. Verify the storage bucket is public
3. Check that image URLs start with your Supabase project URL

## 📈 Monitoring

After migration, monitor these metrics:

1. **Database query size**: Check Network tab for posts query
2. **Page load time**: Should be ~900ms faster
3. **Storage usage**: Monitor in Supabase Dashboard → Storage
4. **Bandwidth**: Check Supabase Dashboard → Project Settings → Billing

## 🎯 Next Steps

After successful migration:

1. Consider adding image optimization (WebP conversion, resizing)
2. Implement lazy loading for images
3. Add image compression before upload
4. Set up CDN caching headers

## 🆘 Need Help?

If you run into issues:

1. Check the console logs for detailed error messages
2. Verify your environment variables are set correctly
3. Ensure you're using the service role key (not anon key) for migration
4. Check Supabase Dashboard for any quota limits

## ✅ Success Checklist

- [ ] Service role key added to `.env.local`
- [ ] `tsx` package installed
- [ ] Storage bucket created
- [ ] All 4 storage policies added
- [ ] New posts tested and working
- [ ] Migration script completed successfully
- [ ] Old posts display images correctly
- [ ] Posts query size reduced significantly
- [ ] Page load time improved

---

**Note**: Keep your `SUPABASE_SERVICE_ROLE_KEY` secret and never commit it to version control!

