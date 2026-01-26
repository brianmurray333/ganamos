/**
 * Migration script to move existing base64 images from database to Supabase Storage
 * 
 * Run this after setting up the storage bucket:
 * npx tsx scripts/migrate-images-to-storage.ts
 * 
 * This script will:
 * 1. Find all posts with base64 images
 * 2. Upload them to Supabase Storage
 * 3. Update the database with the new URLs
 */

import { createClient } from "@supabase/supabase-js"
import { base64ToBlob, STORAGE_BUCKET } from "../lib/storage"
import { config } from "dotenv"
import { resolve } from "path"

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:")
  console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  console.error("   - SUPABASE_SECRET_API_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Post {
  id: string
  user_id: string | null
  image_url: string
  fixed_image_url: string | null
  submitted_fix_image_url: string | null
}

function isBase64(str: string): boolean {
  return str.startsWith("data:image")
}

async function migrateImage(
  base64Data: string,
  userId: string,
  postId: string,
  imageType: "post" | "fix" | "submitted-fix"
): Promise<string | null> {
  try {
    // Convert base64 to blob
    const blob = base64ToBlob(base64Data)
    
    // Generate storage path
    const timestamp = Date.now()
    const path = `migrated/${userId}/${imageType}-${postId}-${timestamp}.jpg`
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, {
        cacheControl: "3600",
        upsert: false,
      })
    
    if (uploadError) {
      console.error(`  ❌ Upload error for ${imageType}:`, uploadError.message)
      return null
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path)
    
    return urlData.publicUrl
  } catch (error) {
    console.error(`  ❌ Error migrating ${imageType} image:`, error)
    return null
  }
}

async function migratePost(post: Post, index: number, total: number) {
  console.log(`\n[${index + 1}/${total}] Processing post ${post.id}...`)
  
  const updates: any = {}
  let changedFields = 0
  
  // Migrate main image
  if (post.image_url && isBase64(post.image_url)) {
    console.log("  📸 Migrating main image...")
    const newUrl = await migrateImage(
      post.image_url,
      post.user_id || "anonymous",
      post.id,
      "post"
    )
    if (newUrl) {
      updates.image_url = newUrl
      changedFields++
      console.log(`  ✅ Main image migrated`)
    }
  } else {
    console.log("  ⏭️  Main image already migrated or not base64")
  }
  
  // Migrate fixed image
  if (post.fixed_image_url && isBase64(post.fixed_image_url)) {
    console.log("  📸 Migrating fix image...")
    const newUrl = await migrateImage(
      post.fixed_image_url,
      post.user_id || "anonymous",
      post.id,
      "fix"
    )
    if (newUrl) {
      updates.fixed_image_url = newUrl
      changedFields++
      console.log(`  ✅ Fix image migrated`)
    }
  }
  
  // Migrate submitted fix image
  if (post.submitted_fix_image_url && isBase64(post.submitted_fix_image_url)) {
    console.log("  📸 Migrating submitted fix image...")
    const newUrl = await migrateImage(
      post.submitted_fix_image_url,
      post.user_id || "anonymous",
      post.id,
      "submitted-fix"
    )
    if (newUrl) {
      updates.submitted_fix_image_url = newUrl
      changedFields++
      console.log(`  ✅ Submitted fix image migrated`)
    }
  }
  
  // Update database if any images were migrated
  if (changedFields > 0) {
    const { error: updateError } = await supabase
      .from("posts")
      .update(updates)
      .eq("id", post.id)
    
    if (updateError) {
      console.error(`  ❌ Database update error:`, updateError.message)
      return false
    }
    
    console.log(`  ✅ Updated ${changedFields} field(s) in database`)
    return true
  }
  
  return false
}

async function runMigration() {
  console.log("🚀 Starting image migration to Supabase Storage...\n")
  
  try {
    // Fetch all posts (paginated to avoid memory issues)
    const pageSize = 50
    let offset = 0
    let hasMore = true
    let totalMigrated = 0
    let totalProcessed = 0
    
    while (hasMore) {
      console.log(`\n📦 Fetching posts ${offset} to ${offset + pageSize}...`)
      
      const { data: posts, error, count } = await supabase
        .from("posts")
        .select("id, user_id, image_url, fixed_image_url, submitted_fix_image_url", { count: "exact" })
        .range(offset, offset + pageSize - 1)
      
      if (error) {
        console.error("❌ Error fetching posts:", error)
        throw error
      }
      
      if (!posts || posts.length === 0) {
        hasMore = false
        break
      }
      
      console.log(`Found ${posts.length} posts in this batch`)
      
      // Process each post
      for (let i = 0; i < posts.length; i++) {
        const migrated = await migratePost(posts[i], totalProcessed + i, count || posts.length)
        if (migrated) totalMigrated++
      }
      
      totalProcessed += posts.length
      offset += pageSize
      
      // Check if there are more posts
      if (posts.length < pageSize || totalProcessed >= (count || 0)) {
        hasMore = false
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    console.log("\n" + "=".repeat(60))
    console.log("✅ Migration complete!")
    console.log(`📊 Results:`)
    console.log(`   - Total posts processed: ${totalProcessed}`)
    console.log(`   - Posts migrated: ${totalMigrated}`)
    console.log(`   - Posts skipped: ${totalProcessed - totalMigrated}`)
    console.log("=".repeat(60))
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error)
    process.exit(1)
  }
}

// Run the migration
runMigration()

