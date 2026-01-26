import { createClient } from "@supabase/supabase-js"
import { createClientComponentClient, createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/lib/database.types"

interface SupabaseOptions {
  supabaseUrl?: string
  supabaseKey?: string
  cookieStore?: any // Using any to avoid direct import of next/headers
}

// Check for environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
  console.error("Missing Supabase environment variables:", {
    hasUrl: !!supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
  })
}

// For backward compatibility - returns the browser client
export const getSupabaseClient = () => {
  return createBrowserSupabaseClient()
}

// For client components - uses the auth helpers
export const createBrowserSupabaseClient = () => {
  return createClientComponentClient<Database>()
}

// For server components and API routes
export const createServerSupabaseClient = (options?: SupabaseOptions) => {
  // If cookieStore is provided, use createServerComponentClient from auth helpers
  // This properly handles auth sessions in Server Components and Server Actions
  if (options?.cookieStore && typeof window === "undefined") {
    // Use the auth helpers for proper session handling
    return createServerComponentClient<Database>({
      cookies: () => options.cookieStore
    })
  }

  // Fallback to basic client for admin operations
  const url = options?.supabaseUrl || (process.env.NEXT_PUBLIC_SUPABASE_URL as string)

  // Only access sensitive environment variables on the server side
  let key: string
  if (typeof window === "undefined") {
    // Server-side: can access sensitive environment variables
      // Use SUPABASE_SECRET_API_KEY (required - matches Vercel production)
      key =
        options?.supabaseKey ||
        process.env.SUPABASE_SECRET_API_KEY ||
        (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string)
  } else {
    // Client-side: only use public environment variables
    key = options?.supabaseKey || (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string)
  }

  // Create client with basic options
  const clientOptions: any = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }

  return createClient<Database>(url, key, clientOptions)
}
