import { createClient } from "@supabase/supabase-js"

// Use the standard environment variable names
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_API_KEY
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY

console.log("🔍 Environment check:")
console.log("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✅ Found" : "❌ Missing")
console.log("SUPABASE_SECRET_API_KEY:", supabaseSecretKey ? "✅ Found" : "❌ Missing")
console.log("GOOGLE_MAPS_API_KEY:", googleApiKey ? "✅ Found" : "❌ Missing")

if (!supabaseUrl || !supabaseSecretKey || !googleApiKey) {
  console.error("❌ Missing required environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)

// Geocoding function
async function getLocationHierarchy(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}`

  const response = await fetch(url)
  const data = await response.json()

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    throw new Error(`Geocoding failed: ${data.status}`)
  }

  const result = data.results[0]
  const components = result.address_components

  const locationData = {
    locality: null,
    admin_area_1: null,
    admin_area_2: null,
    country: null,
    country_code: null,
  }

  for (const component of components) {
    const types = component.types

    if (types.includes("locality")) {
      locationData.locality = component.long_name
    } else if (types.includes("administrative_area_level_1")) {
      locationData.admin_area_1 = component.long_name
    } else if (types.includes("administrative_area_level_2")) {
      locationData.admin_area_2 = component.long_name
    } else if (types.includes("country")) {
      locationData.country = component.long_name
      locationData.country_code = component.short_name
    }
  }

  return locationData
}

async function backfillPostLocations() {
  console.log("🚀 Starting location hierarchy backfill...")

  const { data: posts, error: fetchError } = await supabase
    .from("posts")
    .select("id, latitude, longitude, location")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .is("country", null)

  if (fetchError) {
    console.error("❌ Error fetching posts:", fetchError)
    return
  }

  console.log(`📍 Found ${posts.length} posts to backfill`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    console.log(`\n🔄 Processing post ${i + 1}/${posts.length} (ID: ${post.id})`)

    try {
      const locationData = await getLocationHierarchy(post.latitude, post.longitude)

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          locality: locationData.locality,
          admin_area_1: locationData.admin_area_1,
          admin_area_2: locationData.admin_area_2,
          country: locationData.country,
          country_code: locationData.country_code,
        })
        .eq("id", post.id)

      if (updateError) {
        console.error(`   ❌ Database update failed:`, updateError)
        errorCount++
      } else {
        console.log(`   ✅ Updated: ${locationData.locality}, ${locationData.admin_area_1}, ${locationData.country}`)
        successCount++
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200))
    } catch (error) {
      console.error(`   ❌ Error:`, error.message)
      errorCount++
    }
  }

  console.log(`\n🎉 Complete! ✅ ${successCount} success, ❌ ${errorCount} failed`)
}

backfillPostLocations().catch(console.error)
