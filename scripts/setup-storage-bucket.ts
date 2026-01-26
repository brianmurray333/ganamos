/**
 * Script to set up Supabase Storage bucket for post images
 * 
 * Run this script once to create the storage bucket:
 * npx tsx scripts/setup-storage-bucket.ts
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY! // Need service role key for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:")
  console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  console.error("   - SUPABASE_SECRET_API_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const BUCKET_NAME = "post-images"

async function setupStorageBucket() {
  console.log("🚀 Setting up Supabase Storage bucket...")
  
  try {
    // Check if bucket already exists
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME)
    
    if (bucketExists) {
      console.log(`✅ Bucket "${BUCKET_NAME}" already exists`)
    } else {
      // Create the bucket
      const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp"
        ],
      })
      
      if (error) {
        console.error("❌ Error creating bucket:", error)
        throw error
      }
      
      console.log(`✅ Created bucket "${BUCKET_NAME}"`)
    }
    
    // Set up storage policies for the bucket
    console.log("\n📝 Setting up storage policies...")
    console.log("   Note: You may need to set these manually in the Supabase dashboard")
    console.log("   under Storage > Policies\n")
    
    console.log("Recommended policies:")
    console.log("\n1. SELECT Policy (Allow public reads):")
    console.log("   Name: Public read access")
    console.log("   Definition: true")
    console.log("   Target roles: public")
    
    console.log("\n2. INSERT Policy (Allow authenticated users to upload):")
    console.log("   Name: Authenticated users can upload")  
    console.log("   Definition: auth.role() = 'authenticated'")
    console.log("   Target roles: authenticated")
    
    console.log("\n3. UPDATE Policy (Users can update their own images):")
    console.log("   Name: Users can update own images")
    console.log("   Definition: (storage.foldername(name))[1] = auth.uid()::text")
    console.log("   Target roles: authenticated")
    
    console.log("\n4. DELETE Policy (Users can delete their own images):")
    console.log("   Name: Users can delete own images")
    console.log("   Definition: (storage.foldername(name))[1] = auth.uid()::text")
    console.log("   Target roles: authenticated")
    
    console.log("\n✅ Storage bucket setup complete!")
    console.log("\n📌 Next steps:")
    console.log("   1. Go to Supabase Dashboard > Storage > post-images > Policies")
    console.log("   2. Add the policies listed above")
    console.log("   3. Run the migration script to move existing images")
    
  } catch (error) {
    console.error("❌ Setup failed:", error)
    process.exit(1)
  }
}

setupStorageBucket()

