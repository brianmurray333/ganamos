"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import type { User, Session } from "@supabase/supabase-js"
import type { Profile } from "@/lib/database.types"
import { useToast } from "@/hooks/use-toast"

type AuthContextType = {
  user: User | null
  profile: Profile | null
  mainAccountProfile: Profile | null
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
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const { toast } = useToast()

  // New state for account switching
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [isConnectedAccount, setIsConnectedAccount] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<Profile[]>([])
  const [mainAccountProfile, setMainAccountProfile] = useState<Profile | null>(null)

  // Add refs to prevent concurrent fetches
  const fetchingProfile = useRef<Set<string>>(new Set())
  const fetchingConnectedAccounts = useRef(false)

  // Fetch user profile
  const fetchProfile = useCallback(async (userId: string) => {
    // Prevent concurrent fetches for the same user
    if (fetchingProfile.current.has(userId)) {
      console.log('Skipping duplicate profile fetch for:', userId)
      return null
    }
    
    fetchingProfile.current.add(userId)
    
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
        
        // Generate a default username
        const defaultUsername = userName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .substring(0, 20)

        const newProfile = {
          id: userId,
          email: userEmail || null, // Allow null for phone-only users
          name: userName,
          username: defaultUsername,
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
    } finally {
      fetchingProfile.current.delete(userId)
    }
  }, [supabase])

  // Refresh the user's profile
  const refreshProfile = useCallback(async () => {
    if (!user) {
      return
    }

    const profileId = activeUserId || user.id
    
    // If using main account, only fetch once
    if (!activeUserId || activeUserId === user.id) {
      const mainProfileData = await fetchProfile(user.id)
      if (mainProfileData) {
        setMainAccountProfile(mainProfileData)
        setProfile(mainProfileData)
      }
    } else {
      // If using a connected account, fetch both
      const [mainProfileData, activeProfileData] = await Promise.all([
        fetchProfile(user.id),
        fetchProfile(activeUserId)
      ])
      
      if (mainProfileData) {
        setMainAccountProfile(mainProfileData)
      }
      if (activeProfileData) {
        setProfile(activeProfileData)
      }
    }
  }, [user, activeUserId, fetchProfile])

  // Fetch connected accounts
  const fetchConnectedAccounts = useCallback(async () => {
    if (!user || fetchingConnectedAccounts.current) return

    fetchingConnectedAccounts.current = true

    try {
      console.log('fetchConnectedAccounts called for user:', user.id)
      
      // First, get the connected account relationships
      const { data: connections, error: connectionsError } = await supabase
        .from("connected_accounts")
        .select("connected_user_id")
        .eq("primary_user_id", user.id)

      console.log('Connected accounts relationships:', connections, connectionsError)

      if (connectionsError) {
        console.error('Error fetching connected accounts:', connectionsError)
        return
      }

      if (connections && connections.length > 0) {
        // Extract the user IDs
        const userIds = connections.map(conn => conn.connected_user_id)
        console.log('Connected user IDs:', userIds)
        
        // Fetch all profiles in a single query using IN clause (much faster)
        // Filter out deleted accounts (status = 'deleted')
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds)
          .neq("status", "deleted")
        
        console.log('Bulk profile fetch results:', profiles, profilesError)
        
        if (profilesError) {
          console.error('Error fetching profiles:', profilesError)
          setConnectedAccounts([])
          return
        }
        
        // Filter out any null results and sort by the original connection order
        const accounts = (profiles || [])
          .filter(profile => profile !== null)
          .sort((a, b) => {
            // Maintain the order from connections array
            const aIndex = userIds.indexOf(a.id)
            const bIndex = userIds.indexOf(b.id)
            return aIndex - bIndex
          })
        
        console.log('Final extracted profiles:', accounts)
        setConnectedAccounts(accounts)
      } else {
        console.log('No connected accounts found')
        setConnectedAccounts([])
      }
    } catch (error) {
      console.error('fetchConnectedAccounts catch:', error)
    } finally {
      fetchingConnectedAccounts.current = false
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
        setMainAccountProfile(null);
      }
    }, 2000); // 2 second timeout for session check

    // Helper function to load profile with support for connected accounts
    const loadProfileWithActiveAccount = async (userId: string) => {
      // Check if there's a saved active user ID in localStorage
      const savedActiveUserId = localStorage.getItem(ACTIVE_USER_KEY);
      
      // If using main account, fetch once
      if (!savedActiveUserId || savedActiveUserId === userId) {
        const mainProfile = await fetchProfile(userId);
        if (isMounted && mainProfile) {
          setMainAccountProfile(mainProfile);
          setProfile(mainProfile);
          setActiveUserId(null);
          setIsConnectedAccount(false);
        }
      } else {
        // If there's a saved active user ID, fetch both profiles
        console.log("Restoring active account from localStorage:", savedActiveUserId);
        const [mainProfile, activeProfile] = await Promise.all([
          fetchProfile(userId),
          fetchProfile(savedActiveUserId)
        ]);
        
        if (isMounted) {
          if (mainProfile) {
            setMainAccountProfile(mainProfile);
          }
          
          if (activeProfile) {
            setProfile(activeProfile);
            setActiveUserId(savedActiveUserId);
            setIsConnectedAccount(true);
          } else {
            // If the saved active user doesn't exist anymore, fall back to main account
            console.log("Saved active account not found, falling back to main account");
            localStorage.removeItem(ACTIVE_USER_KEY);
            setProfile(mainProfile);
            setActiveUserId(null);
            setIsConnectedAccount(false);
          }
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      clearTimeout(sessionTimeout);
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
      setSessionLoaded(true);
      if (session?.user) {
        loadProfileWithActiveAccount(session.user.id);
      } else {
        setProfile(null);
        setMainAccountProfile(null);
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
      setMainAccountProfile(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user || null);
      setSessionLoaded(true);
      setLoading(false);
      if (session?.user) {
        loadProfileWithActiveAccount(session.user.id);
        
        // Check for pending anonymous rewards and claim them
        if (typeof window !== 'undefined') {
          const pendingRewardPost = localStorage.getItem('pending_anonymous_reward_post')
          
          if (pendingRewardPost) {
            console.log("Found pending anonymous reward for post:", pendingRewardPost)
            
            try {
              // Import and call the claim action
              const { claimAnonymousRewardAction } = await import('@/app/actions/post-actions')
              const result = await claimAnonymousRewardAction(pendingRewardPost, session.user.id)
              
              if (result.success) {
                console.log("Successfully claimed anonymous reward!")
                toast({
                  title: "Reward Claimed!",
                  description: `You've received ${result.amount} sats for your anonymous fix.`,
                  variant: "default",
                })
                // Clear the pending reward from localStorage
                localStorage.removeItem('pending_anonymous_reward_post')
                localStorage.removeItem('pending_anonymous_reward_amount')
                // Refresh profile to show updated balance
                setTimeout(() => {
                  refreshProfile()
                }, 1000)
              } else {
                console.error("Failed to claim anonymous reward:", result.error)
                toast({
                  title: "Reward Claim Failed",
                  description: result.error || "Unable to claim your anonymous reward.",
                  variant: "destructive",
                })
              }
            } catch (error) {
              console.error("Error claiming anonymous reward:", error)
              toast({
                title: "Reward Claim Error",
                description: "There was an error claiming your anonymous reward.",
                variant: "destructive",
              })
            }
          }
        }
      } else {
        setProfile(null);
        setMainAccountProfile(null);
      }
    });
    return () => {
      isMounted = false;
      clearTimeout(sessionTimeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Fetch connected accounts after user is set
  useEffect(() => {
    if (user) {
      fetchConnectedAccounts()
    }
  }, [user])

  // Set up a real-time subscription to the profile table
  useEffect(() => {
    if (!user) return

    const targetUserId = activeUserId || user.id
    console.log('🔔 Setting up profile real-time subscription for user:', targetUserId)
    
    // Debounce timer to batch rapid profile updates
    let debounceTimer: NodeJS.Timeout | null = null
    let isMounted = true
    
    const profileSubscription = supabase
      .channel(`profile-updates-${targetUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${targetUserId}`,
        },
        async (payload) => {
          console.log('🔔 Profile update detected via real-time subscription!')
          console.log('🔔 Payload:', payload)
          console.log('🔔 New balance:', payload.new?.balance)
          
          // Clear any existing debounce timer
          if (debounceTimer) {
            clearTimeout(debounceTimer)
          }
          
          // Debounce profile updates to prevent rapid state changes
          debounceTimer = setTimeout(async () => {
            if (!isMounted) return
            
            // Fetch fresh profile data
            try {
              const { data: freshProfile, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", targetUserId)
                .single()
              
              if (freshProfile && !error && isMounted) {
                console.log('🔔 Successfully fetched fresh profile, updating state')
                setProfile(freshProfile)
                
                // Also update main account profile if this is the main account
                if (!activeUserId) {
                  setMainAccountProfile(freshProfile)
                }
              } else if (error) {
                console.error('🔔 Error fetching fresh profile:', error)
              }
            } catch (err) {
              console.error('🔔 Exception fetching fresh profile:', err)
            }
          }, 500) // 500ms debounce to batch rapid updates
        },
      )
      .subscribe((status) => {
        console.log('🔔 Profile subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to profile updates!')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel error - subscription failed')
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ Subscription timed out')
        }
      })

    return () => {
      isMounted = false
      console.log('🔔 Unsubscribing from profile updates')
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
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
      console.log('updateProfile called with:', updates)
      console.log('Current user ID:', user.id)
      console.log('Active user ID:', activeUserId)
      console.log('Target profile ID:', profileId)
      console.log('Is connected account:', isConnectedAccount)
      
      // Debug: Check if the connected_accounts relationship exists
      const { data: connectionCheck, error: connectionError } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("primary_user_id", user.id)
        .eq("connected_user_id", profileId)
      
      console.log('Connection check result:', connectionCheck, connectionError)
      
      // Debug: Test if we can select the profile first
      const { data: selectTest, error: selectError } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .eq("id", profileId)
      
      console.log('Profile select test:', selectTest, selectError)
      
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profileId)
        .select()

      console.log('Profile update result:', data, error)

      if (error) {
        console.error('Profile update error:', error)
        throw error
      }

      console.log('Profile updated successfully, refreshing...')
      await refreshProfile()
      
      // Also refresh connected accounts to update family section immediately
      await fetchConnectedAccounts()
    } catch (error) {
      console.error('updateProfile catch block:', error)
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
        mainAccountProfile,
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
