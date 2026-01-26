"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"

export default function AuthDebugPage() {
  const [sessionData, setSessionData] = useState<any>(null)
  const [userDetails, setUserDetails] = useState<any>(null)
  const [supabaseConfig, setSupabaseConfig] = useState<any>(null)
  const { user, profile, session } = useAuth()
  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    const checkSession = async () => {
      // Get session
      const { data, error } = await supabase.auth.getSession()
      setSessionData({ data, error: error?.message })

      // Get user
      const { data: userData, error: userError } = await supabase.auth.getUser()
      setUserDetails({ data: userData, error: userError?.message })

      // Get Supabase config
      setSupabaseConfig({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        authUrl: process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1",
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        origin: window.location.origin,
      })
    }

    checkSession()
  }, [supabase])

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.getSession()
    setSessionData({ data, error: error?.message })
  }

  const clearSession = async () => {
    await supabase.auth.signOut()
    await refreshSession()
  }

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Auth Debug Page</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Auth Context State</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p>
                <strong>User:</strong> {user ? "Authenticated" : "Not authenticated"}
              </p>
              <p>
                <strong>Email:</strong> {user?.email || "N/A"}
              </p>
              <p>
                <strong>Profile:</strong> {profile ? "Loaded" : "Not loaded"}
              </p>
              <p>
                <strong>Session:</strong> {session ? "Active" : "None"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={refreshSession} size="sm">
                  Refresh
                </Button>
                <Button onClick={clearSession} size="sm" variant="outline">
                  Clear Session
                </Button>
              </div>

              <details>
                <summary className="cursor-pointer font-medium">Session Data</summary>
                <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded overflow-auto text-xs">
                  {JSON.stringify(sessionData, null, 2)}
                </pre>
              </details>

              <details>
                <summary className="cursor-pointer font-medium">User Details</summary>
                <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded overflow-auto text-xs">
                  {JSON.stringify(userDetails, null, 2)}
                </pre>
              </details>

              <details>
                <summary className="cursor-pointer font-medium">Supabase Config</summary>
                <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded overflow-auto text-xs">
                  {JSON.stringify(supabaseConfig, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
