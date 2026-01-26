"use server"

import { createServerSupabaseClient } from "@/lib/supabase"

interface LocationHierarchy {
  name: string
  type: "global" | "country" | "admin_1" | "locality"
  emoji: string
  openIssues: number
  locationType: string
  locationName: string
}

interface UserLocationData {
  locality?: string // City
  admin_area_1?: string // State/Province/Prefecture
  country?: string
  country_code?: string
}

export async function getLocationRecommendations(userLocation?: UserLocationData): Promise<LocationHierarchy[]> {
  try {
    const supabase = createServerSupabaseClient({
      supabaseKey: process.env.SUPABASE_SECRET_API_KEY,
    })

    // Build hierarchy from most general to most specific
    const hierarchy: LocationHierarchy[] = []

    // 1. Global (always first)
    const globalCount = await countIssuesByLocation(supabase, "global")
    hierarchy.push({
      name: "Global",
      type: "global",
      emoji: "🌎",
      openIssues: globalCount,
      locationType: "global",
      locationName: "Global",
    })

    if (!userLocation) {
      return hierarchy
    }

    // 2. Country
    if (userLocation.country) {
      const countryCount = await countIssuesByLocation(supabase, "country", userLocation.country)
      hierarchy.push({
        name: userLocation.country,
        type: "country",
        emoji: getCountryEmoji(userLocation.country_code),
        openIssues: countryCount,
        locationType: "country",
        locationName: userLocation.country,
      })
    }

    // 3. State/Province/Prefecture (admin_area_1)
    if (userLocation.admin_area_1) {
      const adminCount = await countIssuesByLocation(supabase, "admin_1", userLocation.admin_area_1)
      hierarchy.push({
        name: userLocation.admin_area_1,
        type: "admin_1",
        emoji: getAdminEmoji(userLocation.country_code),
        openIssues: adminCount,
        locationType: "region",
        locationName: `${userLocation.admin_area_1}, ${userLocation.country}`,
      })
    }

    // 4. City/Locality
    if (userLocation.locality) {
      const cityCount = await countIssuesByLocation(supabase, "locality", userLocation.locality)
      hierarchy.push({
        name: `${userLocation.locality}${userLocation.admin_area_1 ? `, ${getAdminAbbreviation(userLocation.admin_area_1)}` : ""}`,
        type: "locality",
        emoji: "🏙️",
        openIssues: cityCount,
        locationType: "city",
        locationName: `${userLocation.locality}, ${userLocation.admin_area_1 || userLocation.country}`,
      })
    }

    return hierarchy
  } catch (error) {
    console.error("Error getting location recommendations:", error)
    // Return just global as fallback
    return [
      {
        name: "Global",
        type: "global",
        emoji: "🌎",
        openIssues: 0,
        locationType: "global",
        locationName: "Global",
      },
    ]
  }
}

async function countIssuesByLocation(supabase: any, type: string, location?: string): Promise<number> {
  try {
    let query = supabase.from("posts").select("id", { count: "exact", head: true }).eq("fixed", false) // Only count open issues

    switch (type) {
      case "global":
        // Count all open issues
        break
      case "country":
        query = query.eq("country", location)
        break
      case "admin_1":
        query = query.eq("admin_area_1", location)
        break
      case "locality":
        query = query.eq("locality", location)
        break
    }

    const { count } = await query
    return count || 0
  } catch (error) {
    console.error(`Error counting issues for ${type}:`, error)
    return 0
  }
}

function getCountryEmoji(countryCode?: string): string {
  const emojiMap: Record<string, string> = {
    US: "🇺🇸",
    CA: "🇨🇦",
    GB: "🇬🇧",
    DE: "🇩🇪",
    FR: "🇫🇷",
    AU: "🇦🇺",
    JP: "🇯🇵",
    IN: "🇮🇳",
    BR: "🇧🇷",
    MX: "🇲🇽",
    ES: "🇪🇸",
    IT: "🇮🇹",
    NL: "🇳🇱",
    SE: "🇸🇪",
    NO: "🇳🇴",
    DK: "🇩🇰",
    FI: "🇫🇮",
    CH: "🇨🇭",
    AT: "🇦🇹",
    BE: "🇧🇪",
    IE: "🇮🇪",
    PT: "🇵🇹",
    GR: "🇬🇷",
    PL: "🇵🇱",
    CZ: "🇨🇿",
    HU: "🇭🇺",
    RO: "🇷🇴",
    BG: "🇧🇬",
    HR: "🇭🇷",
    SK: "🇸🇰",
    SI: "🇸🇮",
    EE: "🇪🇪",
    LV: "🇱🇻",
    LT: "🇱🇹",
    LU: "🇱🇺",
    MT: "🇲🇹",
    CY: "🇨🇾",
  }
  return emojiMap[countryCode || ""] || "🌍"
}

function getAdminEmoji(countryCode?: string): string {
  // Different admin level representations by country
  const adminEmojiMap: Record<string, string> = {
    US: "🏛️", // States
    CA: "🍁", // Provinces
    GB: "🏰", // Counties/Regions
    DE: "🏛️", // Länder
    FR: "🏛️", // Departments
    AU: "🏛️", // States/Territories
    JP: "🏯", // Prefectures
    IN: "🏛️", // States
  }
  return adminEmojiMap[countryCode || ""] || "🏛️"
}

function getAdminAbbreviation(adminArea: string): string {
  // Common abbreviations for display
  const abbreviations: Record<string, string> = {
    California: "CA",
    "New York": "NY",
    Texas: "TX",
    Florida: "FL",
    Illinois: "IL",
    Pennsylvania: "PA",
    Ohio: "OH",
    Georgia: "GA",
    "North Carolina": "NC",
    Michigan: "MI",
    Ontario: "ON",
    Quebec: "QC",
    "British Columbia": "BC",
    Alberta: "AB",
    Manitoba: "MB",
    Saskatchewan: "SK",
    "Nova Scotia": "NS",
    "New Brunswick": "NB",
    "Newfoundland and Labrador": "NL",
    "Prince Edward Island": "PE",
    "Northwest Territories": "NT",
    Nunavut: "NU",
    Yukon: "YT",
  }
  return abbreviations[adminArea] || adminArea
}
