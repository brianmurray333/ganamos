"use server"

import { createServerSupabaseClient } from "@/lib/supabase"

export async function getGlobalStatistics() {
  try {
    const supabase = createServerSupabaseClient()

    // Get count of fixed issues
    const { count: fixedIssuesCount, error: countError } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("fixed", true)

    if (countError) {
      console.error("Error fetching fixed issues count:", countError)
      return { fixedIssuesCount: 0, totalSatsEarned: 0 }
    }

    // Get sum of rewards for fixed issues
    const { data: rewardsData, error: rewardsError } = await supabase.from("posts").select("reward").eq("fixed", true)

    if (rewardsError) {
      console.error("Error fetching rewards data:", rewardsError)
      return { fixedIssuesCount: fixedIssuesCount || 0, totalSatsEarned: 0 }
    }

    // Calculate total rewards
    const totalSatsEarned = rewardsData.reduce((sum, post) => sum + (post.reward || 0), 0)

    return {
      fixedIssuesCount: fixedIssuesCount || 0,
      totalSatsEarned,
    }
  } catch (error) {
    console.error("Error in getGlobalStatistics:", error)
    return { fixedIssuesCount: 0, totalSatsEarned: 0 }
  }
}
