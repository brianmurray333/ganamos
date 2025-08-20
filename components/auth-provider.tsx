"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import type { User, Session } from "@supabase/supabase-js"
import type { Profile } from "@/lib/database.types"
import { useToast } from "@/hooks/use-toast"

type AuthContextType = {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  sessionLoaded: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<{ success: boolean; message?: string }>
  signInWithPhone: (phone: string) => Promise<{ success: boolean; message?: string }>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  updateBalance: (newBalance: number) => Promise<void>
  refreshProfile: () => Promise<void>
  activeUserId: string | null
  isConnectedAccount: boolean
  switchToAccount: (userId: string) => Promise<void>
  resetToMainAccount: () => Promise<void>
  connectedAccounts: Profile[]
  fetchConnectedAccounts: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Local storage key for active user
const ACTIVE_USER_KEY = "ganamos_active_user_id"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true) // Start with true
  const [sessionLoaded, setSessionLoaded] = useState(false) // Start with false
  const router = useRouter()
  const supabase = createBrowserSupabaseClient()
  const { toast } = useToast()

  // New state for account switching
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [isConnectedAccount, setIsConnectedAccount] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<Profile[]>([])

  // Fetch user profile
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error || !data) {
        const { data: userData } = await supabase.auth.getUser()
        
        // For phone auth users, email might be null/undefined
        const userEmail = userData.user?.email
        const userPhone = userData.user?.phone
        const userName = userData.user?.user_metadata?.full_name || 
                        userData.user?.user_metadata?.name || 
                        (userPhone ? `User ${userPhone.slice(-4)}` : "User")
        
        const newProfile = {
          id: userId,
          email: userEmail || null, // Allow null for phone-only users
          name: userName,
          avatar_url: userData.user?.user_metadata?.avatar_url || null,
          balance: 0, // Starting balance
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        console.log("Creating new profile for user:", userId, newProfile)
        
        const { data: createdProfile, error: createError } = await supabase
          .from("profiles")
          .insert(newProfile)
          .select()
          .single()

        if (createError) {
          console.error("Error creating profile:", createError)
          console.error("Profile data that failed:", newProfile)
          return null
        }
        
        console.log("Successfully created profile:", createdProfile)

        return createdProfile || newProfile
      }

      // Ensure balance is never undefined
      if (data) {
        data.balance = data.balance || 0
      }

      return data
    } catch (error) {
      return null
    }
  }, [supabase])

  // Refresh the user's profile
  const refreshProfile = useCallback(async () => {
    if (!user) {
      return
    }

    // If we're using a connected account, fetch that profile instead
    const profileId = activeUserId || user.id

    const profileData = await fetchProfile(profileId)
    if (profileData) {
      setProfile(profileData)
    }
  }, [user, activeUserId, fetchProfile])

  // Fetch connected accounts
  const fetchConnectedAccounts = useCallback(async () => {
    if (!user) return

    try {
      // Get accounts where the current user is the primary user
      const { data, error } = await supabase
        .from("connected_accounts")
        .select("connected_user_id, profiles:connected_user_id(*)")
        .eq("primary_user_id", user.id)

      if (error) {
        return
      }

      if (data && data.length > 0) {
        // Extract the profile data from the joined query
        const accounts = data.map((item) => item.profiles as unknown as Profile)
        setConnectedAccounts(accounts)
      } else {
        setConnectedAccounts([])
      }
    } catch (error) {
    }
  }, [user, supabase])

  // Switch to a connected account
  const switchToAccount = async (userId: string) => {
    if (!user) return

    try {
      // Verify this is a valid connected account
      const { data, error } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("primary_user_id", user.id)
        .eq("connected_user_id", userId)
        .single()

      if (error || !data) {
        toast({
          title: "Error",
          description: "This account is not connected to your profile",
          variant: "destructive",
        })
        return
      }

      // Fetch the profile for the connected account
      const profileData = await fetchProfile(userId)
      if (!profileData) {
        toast({
          title: "Error",
          description: "Could not load connected account profile",
          variant: "destructive",
        })
        return
      }

      // Set the active user ID in localStorage
      localStorage.setItem(ACTIVE_USER_KEY, userId)

      // Update state
      setActiveUserId(userId)
      setIsConnectedAccount(true)
      setProfile(profileData)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to switch accounts",
        variant: "destructive",
      })
    }
  }

  // Reset to main account
  const resetToMainAccount = async () => {
    if (!user) return

    try {
      // Clear the active user ID from localStorage
      localStorage.removeItem(ACTIVE_USER_KEY)

      // Fetch the main user's profile
      const profileData = await fetchProfile(user.id)

      // Update state
      setActiveUserId(null)
      setIsConnectedAccount(false)
      setProfile(profileData)
    } catch (error) {
    }
  }

  // Robust session management: only check session once on mount, and subscribe to changes
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setSessionLoaded(false);
    
    // Add timeout to prevent infinite loading
    const sessionTimeout = setTimeout(() => {
      if (isMounted) {
        console.log("Session check timeout, falling back to no session");
        setSession(null);
        setUser(null);
        setLoading(false);
        setSessionLoaded(true);
        setProfile(null);
      }
    }, 2000); // 2 second timeout for session check

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      clearTimeout(sessionTimeout);
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
      setSessionLoaded(true);
      if (session?.user) {
        fetchProfile(session.user.id).then((profileData) => {
          if (isMounted) setProfile(profileData);
        });
      } else {
        setProfile(null);
      }
    }).catch((error) => {
      if (!isMounted) return;
      console.error("Error getting session:", error);
      clearTimeout(sessionTimeout);
      setSession(null);
      setUser(null);
      setLoading(false);
      setSessionLoaded(true);
      setProfile(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user || null);
      setSessionLoaded(true);
      setLoading(false);
      if (session?.user) {
        fetchProfile(session.user.id).then((profileData) => {
          if (isMounted) setProfile(profileData);
        });
      } else {
        setProfile(null);
      }
    });
    return () => {
      isMounted = false;
      clearTimeout(sessionTimeout);
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  // Fetch connected accounts after user is set
  useEffect(() => {
    if (user) {
      fetchConnectedAccounts()
    }
  }, [user, fetchConnectedAccounts])

  // Set up a real-time subscription to the profile table
  useEffect(() => {
    if (!user) return

    const profileSubscription = supabase
      .channel("profile-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${activeUserId || user.id}`,
        },
        async (payload) => {
          await refreshProfile()
        },
      )
      .subscribe()

    return () => {
      profileSubscription.unsubscribe()
    }
  }, [user, activeUserId, supabase])

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign in with Google",
        variant: "destructive",
      })
    }
  }

  // Sign in with email and password
  const signInWithEmail = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { success: false, message: error.message }
      }

      return { success: true }
    } catch (error) {
      return { success: false, message: "An unexpected error occurred" }
    }
  }

  // Sign in with phone
  const signInWithPhone = async (phone: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          shouldCreateUser: true,
        },
      })

      if (error) {
        return { success: false, message: error.message }
      }

      return { success: true }
    } catch (error) {
      return { success: false, message: "An unexpected error occurred" }
    }
  }

  // Sign up with email
  const signUpWithEmail = async (email: string, password: string, name: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
        },
      })

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: "Please check your email to verify your account",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create account",
        variant: "destructive",
      })
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      // Clear active user on sign out
      localStorage.removeItem(ACTIVE_USER_KEY)
      setActiveUserId(null)
      setIsConnectedAccount(false)
      setConnectedAccounts([])

      await supabase.auth.signOut()
      router.push("/")
    } catch (error) {
    }
  }

  // Update profile
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return

    try {
      const profileId = activeUserId || user.id
      const { error } = await supabase.from("profiles").update(updates).eq("id", profileId)

      if (error) throw error

      await refreshProfile()
    } catch (error) {
      throw error
    }
  }

  // Update balance
  const updateBalance = async (newBalance: number) => {
    if (!user || !profile) {
      return
    }

    try {
      const profileId = activeUserId || user.id
      const { error } = await supabase
        .from("profiles")
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId)

      if (error) {
        throw error
      }

      // Update local state
      setProfile({
        ...profile,
        balance: newBalance,
      })

      await refreshProfile()
    } catch (error) {
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        sessionLoaded,
        signInWithGoogle,
        signInWithEmail,
        signInWithPhone,
        signUpWithEmail,
        signOut,
        updateProfile,
        updateBalance,
        refreshProfile,
        // New account switching functionality
        activeUserId,
        isConnectedAccount,
        switchToAccount,
        resetToMainAccount,
        connectedAccounts,
        fetchConnectedAccounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
