/**
 * Supabase Storage utilities for handling image uploads
 */

import { createBrowserSupabaseClient } from "@/lib/supabase"

export const STORAGE_BUCKET = "post-images"

/**
 * Convert a base64 data URL to a Blob
 */
export function base64ToBlob(base64: string): Blob {
  // Remove data URL prefix if present
  const base64Data = base64.includes(",") ? base64.split(",")[1] : base64
  
  // Decode base64
  const byteCharacters = atob(base64Data)
  const byteNumbers = new Array(byteCharacters.length)
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  
  const byteArray = new Uint8Array(byteNumbers)
  
  // Determine MIME type from data URL or default to JPEG
  let mimeType = "image/jpeg"
  if (base64.startsWith("data:")) {
    const matches = base64.match(/data:([^;]+);/)
    if (matches && matches[1]) {
      mimeType = matches[1]
    }
  }
  
  return new Blob([byteArray], { type: mimeType })
}

/**
 * Upload an image to Supabase Storage
 * @param imageData - base64 data URL or Blob
 * @param path - storage path (e.g., "posts/user-id/timestamp.jpg")
 * @returns Public URL of the uploaded image
 */
export async function uploadImage(
  imageData: string | Blob,
  path: string
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const supabase = createBrowserSupabaseClient()
    
    // Convert base64 to blob if needed
    const blob = typeof imageData === "string" ? base64ToBlob(imageData) : imageData
    
    // Upload to storage
    const { data, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, {
        cacheControl: "3600",
        upsert: false,
      })
    
    if (uploadError) {
      console.error("Storage upload error:", uploadError)
      return { url: null, error: uploadError }
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path)
    
    return { url: urlData.publicUrl, error: null }
  } catch (error) {
    console.error("Upload image error:", error)
    return { url: null, error: error as Error }
  }
}

/**
 * Generate a unique storage path for an image
 * @param userId - user ID
 * @param prefix - prefix for the path (e.g., "posts", "fixes")
 * @returns storage path string
 */
export function generateImagePath(userId: string, prefix: string = "posts"): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  return `${prefix}/${userId}/${timestamp}-${random}.jpg`
}

/**
 * Delete an image from storage
 * @param url - public URL of the image to delete
 */
export async function deleteImage(url: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const supabase = createBrowserSupabaseClient()
    
    // Extract path from URL
    // URL format: https://<project-ref>.supabase.co/storage/v1/object/public/post-images/<path>
    const urlParts = url.split(`/${STORAGE_BUCKET}/`)
    if (urlParts.length < 2) {
      return { success: false, error: new Error("Invalid storage URL") }
    }
    
    const path = urlParts[1]
    
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path])
    
    if (error) {
      console.error("Storage delete error:", error)
      return { success: false, error }
    }
    
    return { success: true, error: null }
  } catch (error) {
    console.error("Delete image error:", error)
    return { success: false, error: error as Error }
  }
}

/**
 * Check if a URL is a base64 data URL
 */
export function isBase64Image(url: string): boolean {
  return url.startsWith("data:image")
}

/**
 * Check if a URL is a storage URL
 */
export function isStorageUrl(url: string): boolean {
  return url.includes("supabase.co/storage") || url.includes(STORAGE_BUCKET)
}

