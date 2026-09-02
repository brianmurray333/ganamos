import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createClient } from "@supabase/supabase-js"

/** Accepts the website cookie session or a Supabase bearer token from a native client. */
export async function authenticatedRequestClient(request: Request) {
  const authorization = request.headers.get("authorization")
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
    const { data: { user }, error } = await supabase.auth.getUser(token)
    return { supabase, user, error }
  }

  const supabase = createRouteHandlerClient({ cookies })
  if (typeof supabase.auth.getUser === "function") {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { supabase, user, error }
  }

  // Some route-test clients expose only the legacy session method.
  const { data: { session }, error } = await supabase.auth.getSession()
  return { supabase, user: session?.user ?? null, error }
}
