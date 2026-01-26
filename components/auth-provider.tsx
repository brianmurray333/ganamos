"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import type { User, Session } from "@supabase/supabase-js"
import type { Profile } from "@/lib/database.types"
import { toast } from "sonner"

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
  mockLogin: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Local storage key for active user
const ACTIVE_USER_KEY = "ganamos_active_user_id"

// Fire-and-forget seed data generation for mock user
// Only runs in non-production with USE_MOCKS=true
const triggerSeedDataGeneration = async (userId: string) => {
  // Guard: only trigger in mock environments
  if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_USE_MOCKS !== 'true') {
    return;
  }

  try {
    console.log('[Auth Provider] Triggering seed data generation...');
    
    // Fire-and-forget: don't await or block login flow
    fetch('/api/mock/seed-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          console.log('[Auth Provider] Seed data generation completed:', data);
        } else {
          console.warn('[Auth Provider] Seed data generation failed:', data.error);
        }
      })
      .catch((error) => {
        console.warn('[Auth Provider] Seed data generation request failed:', error);
      });
  } catch (error) {
    // Silently fail - seed generation is non-critical
    console.warn('[Auth Provider] Failed to trigger seed generation:', error);
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true) // Start with true
  const [sessionLoaded, setSessionLoaded] = useState(false) // Start with false
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])

  // New state for account switching
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [isConnectedAccount, setIsConnectedAccount] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState<Profile[]>([])
  const [mainAccountProfile, setMainAccountProfile] = useState<Profile | null>(null)

  // Add refs to prevent concurrent fetches
  const fetchingProfile = useRef<Set<string>>(new Set())
  const fetchingConnectedAccounts = useRef(false)
  const hashErrorHandled = useRef(false)

  // Handle auth hash fragments (errors and recovery tokens)
  // Errors come from Supabase redirects like: /#error=access_denied&error_code=otp_expired
  // Recovery tokens come like: /#access_token=...&type=recovery
  useEffect(() => {
    if (typeof window === "undefined" || hashErrorHandled.current) return
    
    const hash = window.location.hash
    if (!hash) return
    
    hashErrorHandled.current = true
    
    try {
      const hashParams = new URLSearchParams(hash.substring(1))
      
      // Check for recovery flow first - redirect to reset-password page
      const type = hashParams.get("type")
      const accessToken = hashParams.get("access_token")
      
      if (type === "recovery" && accessToken) {
        console.log("[AUTH] Recovery token detected in hash, redirecting to reset-password")
        // Keep the hash so reset-password page can use it
        router.push(`/auth/reset-password${hash}`)
        return
      }
      
      // Check for errors
      const error = hashParams.get("error")
      const errorCode = hashParams.get("error_code")
      const errorDescription = hashParams.get("error_description")
      
      if (error) {
        console.log("[AUTH] Hash error detected:", { error, errorCode, errorDescription })
        
        // Show user-friendly error messages
        if (errorCode === "otp_expired") {
          toast.error("Password reset link expired", {
            description: "The link has expired. Please request a new password reset.",
            duration: 8000,
            action: {
              label: "Reset Password",
              onClick: () => router.push("/auth/forgot-password"),
            },
          })
        } else if (errorCode === "access_denied") {
          toast.error("Access denied", {
            description: errorDescription?.replace(/\+/g, " ") || "Authentication failed. Please try again.",
            duration: 6000,
          })
        } else {
          toast.error("Authentication error", {
            description: errorDescription?.replace(/\+/g, " ") || "Something went wrong. Please try again.",
            duration: 6000,
          })
        }
        
        // Clear the hash from URL for cleaner UX
        window.history.replaceState(null, "", window.location.pathname)
      }
    } catch (e) {
      console.error("[AUTH] Error parsing hash params:", e)
    }
  }, [router])

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
        
        // Generate a default username from name first
        let defaultUsername = userName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .substring(0, 20)
        
        // If username is too short (less than 3 chars), try email prefix
        if (defaultUsername.length < 3 && userEmail) {
          const emailPrefix = userEmail.split('@')[0]
          defaultUsername = emailPrefix
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-') // collapse multiple hyphens
            .replace(/^-|-$/g, '') // trim leading/trailing hyphens
            .substring(0, 20)
        }
        
        // Final fallback: use part of user ID
        if (defaultUsername.length < 3) {
          defaultUsername = `user-${userId.substring(0, 8)}`
        }

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

      // If profile exists but username is missing, generate and update it
      if (data && !data.username) {
        const { data: userData } = await supabase.auth.getUser()
        const userName = userData.user?.user_metadata?.full_name || 
                        userData.user?.user_metadata?.name || 
                        data.name ||
                        "User"
        
        // Generate username from name
        let defaultUsername = userName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .substring(0, 20)
        
        // If too short, try email prefix
        if (defaultUsername.length < 3 && data.email) {
          const emailPrefix = data.email.split('@')[0]
          defaultUsername = emailPrefix
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 20)
        }
        
        // Final fallback
        if (defaultUsername.length < 3) {
          defaultUsername = `user-${userId.substring(0, 8)}`
        }

        // Check if username is already taken and add suffix if needed
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", defaultUsername)
          .neq("id", userId)
          .maybeSingle()

        if (existingUser) {
          // Username taken, add random suffix
          const suffix = Math.random().toString(36).substring(2, 6)
          defaultUsername = `${defaultUsername.substring(0, 15)}-${suffix}`
        }

        console.log("Updating profile with missing username:", userId, defaultUsername)
        
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ username: defaultUsername, updated_at: new Date().toISOString() })
          .eq("id", userId)

        if (updateError) {
          console.error("Error updating username:", updateError)
        } else {
          data.username = defaultUsername
        }
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

  // Use a ref to store refreshProfile so we don't need to include it in useEffect deps
  // This prevents the effect from re-running when activeUserId changes
  const refreshProfileRef = useRef<() => Promise<void>>(() => Promise.resolve())
  useEffect(() => {
    refreshProfileRef.current = refreshProfile
  }, [refreshProfile])

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
        toast.error("Error", {
          description: "This account is not connected to your profile",
        })
        return
      }

      // Fetch the profile for the connected account
      const profileData = await fetchProfile(userId)
      if (!profileData) {
        toast.error("Error", {
          description: "Could not load connected account profile",
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
      toast.error("Error", {
        description: "Failed to switch accounts",
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
    // Wrapped with timeout and error handling to prevent hanging
    const loadProfileWithActiveAccount = async (userId: string) => {
      // The user?.id fix in subscription useEffect is the main protection against infinite loops
      // No need for a concurrent call guard - if the infinite loop is fixed, concurrent calls shouldn't happen
      try {
        // Add timeout protection (5 seconds max)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Profile loading timeout')), 5000);
        });

        const profilePromise = (async () => {
          // Check if there's a saved active user ID in localStorage
          let savedActiveUserId = localStorage.getItem(ACTIVE_USER_KEY);
          console.log('[AUTH] loadProfileWithActiveAccount - userId:', userId, 'savedActiveUserId:', savedActiveUserId);
          
          // Validate savedActiveUserId - must be a valid UUID format (36 chars with dashes)
          // If invalid, clear it immediately to prevent issues
          if (savedActiveUserId && (savedActiveUserId.trim() === '' || savedActiveUserId.length !== 36 || !savedActiveUserId.includes('-'))) {
            console.warn('[AUTH] Invalid savedActiveUserId format detected, clearing:', savedActiveUserId);
            localStorage.removeItem(ACTIVE_USER_KEY);
            savedActiveUserId = null;
          }
          
          // If using main account, fetch once
          if (!savedActiveUserId || savedActiveUserId === userId) {
            console.log('[AUTH] Loading main account profile');
            const mainProfile = await fetchProfile(userId);
            if (isMounted && mainProfile) {
              setMainAccountProfile(mainProfile);
              setProfile(mainProfile);
              setActiveUserId(null);
              setIsConnectedAccount(false);
            }
          } else {
            // If there's a saved active user ID, verify it's a valid connected account first
            console.log('[AUTH] Attempting to restore connected account from localStorage:', savedActiveUserId);
            
            // Add timeout to connected account check query (3 seconds)
            const checkTimeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Connected account check timeout')), 3000);
            });
            
            try {
              const { data: connectedAccountCheck } = await Promise.race([
                supabase
                  .from('connected_accounts')
                  .select('id')
                  .eq('primary_user_id', userId)
                  .eq('connected_user_id', savedActiveUserId)
                  .maybeSingle(),
                checkTimeoutPromise,
              ]);
              
              if (!connectedAccountCheck) {
                console.log('[AUTH] Saved account is not a valid connected account, clearing and using main');
                localStorage.removeItem(ACTIVE_USER_KEY);
                const mainProfile = await fetchProfile(userId);
                if (isMounted && mainProfile) {
                  setMainAccountProfile(mainProfile);
                  setProfile(mainProfile);
                  setActiveUserId(null);
                  setIsConnectedAccount(false);
                }
                return;
              }
              
              // Valid connected account - fetch both profiles
              const [mainProfile, activeProfile] = await Promise.all([
                fetchProfile(userId),
                fetchProfile(savedActiveUserId)
              ]);
              
              if (isMounted) {
                if (mainProfile) {
                  setMainAccountProfile(mainProfile);
                }
                
                if (activeProfile) {
                  console.log('[AUTH] Successfully restored connected account:', activeProfile.name);
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
            } catch (checkError) {
              // If connected account check fails or times out, clear localStorage and use main account
              console.error('[AUTH] Error checking connected account, falling back to main:', checkError);
              localStorage.removeItem(ACTIVE_USER_KEY);
              const mainProfile = await fetchProfile(userId);
              if (isMounted && mainProfile) {
                setMainAccountProfile(mainProfile);
                setProfile(mainProfile);
                setActiveUserId(null);
                setIsConnectedAccount(false);
              }
            }
          }
        })();

        await Promise.race([profilePromise, timeoutPromise]);
      } catch (error) {
        // If profile loading fails or times out, clear potentially corrupted localStorage and load main profile
        console.error('[AUTH] Error in loadProfileWithActiveAccount, clearing localStorage and loading main profile:', error);
        
        // Clear potentially corrupted localStorage
        try {
          localStorage.removeItem(ACTIVE_USER_KEY);
        } catch (e) {
          console.error('[AUTH] Error clearing localStorage:', e);
        }
        
        // Try to load just the main profile
        try {
          const mainProfile = await fetchProfile(userId);
          if (isMounted && mainProfile) {
            setMainAccountProfile(mainProfile);
            setProfile(mainProfile);
            setActiveUserId(null);
            setIsConnectedAccount(false);
          }
        } catch (profileError) {
          console.error('[AUTH] Error loading main profile after fallback:', profileError);
          // Even if profile loading fails, we should still allow the app to render
          // The user can still use the app, they just won't have profile data initially
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
        // Don't await - let it load in background, errors are handled internally
        loadProfileWithActiveAccount(session.user.id).catch((error) => {
          console.error('[AUTH] Unhandled error in loadProfileWithActiveAccount:', error);
        });
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

      // DEBUG: Log all auth state changes for debugging navigation issues after password reset
      console.log('[AUTH-STATE-CHANGE]', {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        timestamp: new Date().toISOString(),
      });

      // Handle PASSWORD_RECOVERY event - redirect to reset password page
      if (event === 'PASSWORD_RECOVERY') {
        console.log('🔐 Password recovery event detected, redirecting to reset page');
        router.push('/auth/reset-password');
        return;
      }

      // Security check: Block test user login if POD_URL is not defined
      if (session?.user?.email === 'test@ganamos.dev' && !process.env.NEXT_PUBLIC_POD_URL) {
        console.warn('⚠️ Test user login blocked - POD_URL not defined');
        await supabase.auth.signOut();
        toast.error("Access Denied", {
          description: "Test user is only available in development environments",
        });
        return;
      }

      setSession(session);
      setUser(session?.user || null);
      setSessionLoaded(true);
      setLoading(false);
      if (session?.user) {
        // Redirect authenticated users away from auth pages after sign-in
        // This handles navigation for both manual login and mock login
        if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          const hash = window.location.hash;
          const searchParams = new URLSearchParams(window.location.search);
          
          console.log('[AUTH-DEBUG] SIGNED_IN event detected', {
            currentPath,
            fullUrl: window.location.href,
            hasSession: !!session,
            userId: session?.user?.id,
            hash: hash ? 'present' : 'none',
          });
          
          // Check if this is actually a password recovery flow
          // Supabase sometimes sends SIGNED_IN instead of PASSWORD_RECOVERY
          const hashParams = hash ? new URLSearchParams(hash.substring(1)) : null;
          const isRecoveryFlow = 
            (hashParams?.get('type') === 'recovery') ||
            (searchParams.get('type') === 'recovery') ||
            currentPath === '/auth/reset-password';
          
          if (isRecoveryFlow) {
            console.log('🔐 Recovery flow detected in SIGNED_IN event, redirecting to reset page');
            router.push('/auth/reset-password');
            return;
          }
          
          // Check if we're on an auth-related page or home page
          // Need to redirect if on: /auth/login, /auth/register, /, or any auth path
          const isOnAuthPage = currentPath === '/auth/login' || 
                               currentPath === '/auth/register' ||
                               currentPath === '/' ||
                               currentPath.startsWith('/auth/');
          
          // Don't redirect if already on dashboard or a protected route
          const isOnProtectedRoute = currentPath === '/dashboard' ||
                                     currentPath.startsWith('/dashboard') ||
                                     currentPath.startsWith('/wallet') ||
                                     currentPath.startsWith('/profile') ||
                                     currentPath.startsWith('/post/');
          
          console.log('[AUTH-DEBUG] Navigation check', {
            isOnAuthPage,
            isOnProtectedRoute,
            shouldRedirect: isOnAuthPage && !isOnProtectedRoute,
          });
          
          if (isOnAuthPage && !isOnProtectedRoute) {
            // Get redirect parameter if present (e.g., from middleware or login page)
            const urlParams = new URLSearchParams(window.location.search);
            const redirectTo = urlParams.get('redirect') || '/dashboard';
            
            console.log('[AUTH] User signed in on auth/home page, redirecting to dashboard', {
              currentPath,
              redirectTo,
            });
            
            // Only redirect to dashboard or valid protected routes
            if (redirectTo === '/dashboard' || redirectTo.startsWith('/dashboard') || 
                redirectTo.startsWith('/wallet') || redirectTo.startsWith('/profile')) {
              console.log('[AUTH-DEBUG] Calling router.replace with:', redirectTo);
              router.replace(redirectTo);
            } else {
              console.log('[AUTH-DEBUG] Invalid redirect target, using /dashboard');
              router.replace('/dashboard');
            }
          } else if (isOnProtectedRoute) {
            console.log('[AUTH-DEBUG] Already on protected route, no redirect needed');
          } else {
            console.log('[AUTH-DEBUG] Not on auth page, no redirect needed', { currentPath });
          }
        }
        
        // Don't await - let it load in background, errors are handled internally
        loadProfileWithActiveAccount(session.user.id).catch((error) => {
          console.error('[AUTH] Unhandled error in loadProfileWithActiveAccount:', error);
        });
        
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
                toast.success("Reward Claimed!", {
                  description: `You've received ${result.amount} sats for your anonymous fix.`,
                })
                // Clear the pending reward from localStorage
                localStorage.removeItem('pending_anonymous_reward_post')
                localStorage.removeItem('pending_anonymous_reward_amount')
                // Refresh profile to show updated balance
                setTimeout(() => {
                  refreshProfileRef.current()
                }, 1000)
              } else {
                console.error("Failed to claim anonymous reward:", result.error)
                toast.error("Reward Claim Failed", {
                  description: result.error || "Unable to claim your anonymous reward.",
                })
              }
            } catch (error) {
              console.error("Error claiming anonymous reward:", error)
              toast.error("Reward Claim Error", {
                description: "There was an error claiming your anonymous reward.",
              })
            }
          }

          // Check for pending anonymous fix submissions and associate them with the account
          const pendingFixPost = localStorage.getItem('pending_anonymous_fix_post')
          
          if (pendingFixPost) {
            console.log("Found pending anonymous fix submission for post:", pendingFixPost)
            
            try {
              // Import and call the associate action
              const { associateAnonymousFixWithAccountAction } = await import('@/app/actions/post-actions')
              const result = await associateAnonymousFixWithAccountAction(pendingFixPost, session.user.id)
              
              if (result.success) {
                console.log("Successfully associated anonymous fix with account!")
                toast.success("Fix Associated!", {
                  description: "Your anonymous fix submission has been linked to your account. You'll be notified when it's approved.",
                })
                // Clear the pending fix from localStorage
                localStorage.removeItem('pending_anonymous_fix_post')
              } else {
                console.error("Failed to associate anonymous fix:", result.error)
                // Don't show error toast - it's not critical, the fix can still be approved manually
              }
            } catch (error) {
              console.error("Error associating anonymous fix:", error)
              // Don't show error toast - it's not critical
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
    // Note: We intentionally don't include refreshProfile in deps to avoid re-running
    // when activeUserId changes. We use refreshProfileRef.current instead.
    // IMPORTANT: router is intentionally excluded from deps to prevent the effect from re-running
    // on navigation, which would reset loading/sessionLoaded states and cause infinite spinners.
    // The router is only used for navigation calls which work fine with a stale reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, fetchProfile]);

  // Fetch connected accounts after user is set
  useEffect(() => {
    if (user) {
      fetchConnectedAccounts()
    }
  }, [user, fetchConnectedAccounts])

  // Set up a real-time subscription to the profile table
  // Use a ref to track the current subscription to prevent rapid recreation
  const subscriptionRef = useRef<any>(null)
  const subscriptionUserIdRef = useRef<string | null>(null)
  const activeUserIdRef = useRef<string | null>(null)
  
  // Keep activeUserIdRef in sync for use in subscription callback
  useEffect(() => {
    activeUserIdRef.current = activeUserId
  }, [activeUserId])
  
  useEffect(() => {
    if (!user?.id) {
      // Clean up subscription if user logs out
      if (subscriptionRef.current) {
        console.log('🔔 Cleaning up subscription due to logout')
        subscriptionRef.current.unsubscribe()
        subscriptionRef.current = null
        subscriptionUserIdRef.current = null
      }
      return
    }

    const targetUserId = activeUserId || user.id
    
    // Only create a new subscription if the target user has actually changed
    // This prevents re-subscribing when the effect re-runs unnecessarily
    if (subscriptionUserIdRef.current === targetUserId && subscriptionRef.current) {
      console.log('🔔 Subscription already exists for user:', targetUserId)
      return
    }
    
    // Clean up old subscription before creating new one
    if (subscriptionRef.current) {
      console.log('🔔 Cleaning up old subscription')
      subscriptionRef.current.unsubscribe()
    }
    
    console.log('🔔 Setting up profile real-time subscription for user:', targetUserId)
    subscriptionUserIdRef.current = targetUserId
    
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
          
          // Fetch fresh profile data
          try {
            const { data: freshProfile, error } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", targetUserId)
              .single()
            
            if (freshProfile && !error) {
              console.log('🔔 Successfully fetched fresh profile, updating state')
              setProfile(freshProfile)
              
              // Also update main account profile if this is the main account
              // Use ref to get current value without causing dependency issues
              if (!activeUserIdRef.current) {
                setMainAccountProfile(freshProfile)
              }
            } else {
              console.error('🔔 Error fetching fresh profile:', error)
            }
          } catch (err) {
            console.error('🔔 Exception fetching fresh profile:', err)
          }
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
    
    subscriptionRef.current = profileSubscription

    return () => {
      console.log('🔔 Unsubscribing from profile updates')
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
        subscriptionRef.current = null
      }
      subscriptionUserIdRef.current = null
    }
    // Use user?.id instead of user object to prevent re-subscribing when user object identity changes
    // This is the KEY FIX - user object changes on every render, causing infinite loops
  }, [user?.id, activeUserId, supabase])

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
        toast.error("Error", {
          description: error.message,
        })
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to sign in with Google",
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
      throw error
    }
    // Don't show toasts here - let the caller decide
  }

  // Sign out
  const signOut = async () => {
    try {
      // Clear active user on sign out
      localStorage.removeItem(ACTIVE_USER_KEY)
      setActiveUserId(null)
      setIsConnectedAccount(false)
      setConnectedAccounts([])

      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("[AUTH] Sign out error:", error)
        toast.error("Sign out failed", {
          description: error.message || "Please try again",
        })
        return
      }
      
      // Clear auth state immediately to prevent stale session
      setSession(null)
      setUser(null)
      setProfile(null)
      setMainAccountProfile(null)
      
      router.push("/")
    } catch (error) {
      console.error("[AUTH] Unexpected sign out error:", error)
      toast.error("Sign out failed", {
        description: "An unexpected error occurred. Please try again.",
      })
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

  // Mock login for development/testing
  const mockLogin = async () => {
    // Security check: Only allow mock login if POD_URL is defined
    if (!process.env.NEXT_PUBLIC_POD_URL) {
      toast.error("Access Denied", {
        description: "Mock login is only available in development environments",
      })
      return
    }

    try {
      // Try to sign in with the test user credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: 'test@ganamos.dev',
        password: 'test123456',
      })

      // If user doesn't exist, create it
      if (signInError && signInError.message.includes('Invalid login credentials')) {
        console.log('Test user does not exist, creating...')

        const { error: signUpError } = await supabase.auth.signUp({
          email: 'test@ganamos.dev',
          password: 'test123456',
          options: {
            data: {
              name: 'Test User',
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (signUpError) {
          toast.error("Mock Login Failed", {
            description: `Failed to create test user: ${signUpError.message}`,
          })
          return
        }

        // Now try to sign in again
        const { error: retrySignInError } = await supabase.auth.signInWithPassword({
          email: 'test@ganamos.dev',
          password: 'test123456',
        })

        if (retrySignInError) {
          toast.error("Mock Login Failed", {
            description: retrySignInError.message,
          })
          return
        }
      } else if (signInError) {
        toast.error("Mock Login Failed", {
          description: signInError.message,
        })
        return
      }

      // Wait for auth state to propagate and session to be set
      // Poll for session to be available (with timeout) to ensure auth state is ready
      let attempts = 0
      const maxAttempts = 20 // 2 seconds total (20 * 100ms)
      let sessionReady = false
      
      while (attempts < maxAttempts && !sessionReady) {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession?.user) {
          sessionReady = true
          console.log('[AUTH-DEBUG] mockLogin: Session ready after', attempts * 100, 'ms')
        } else {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
      }
      
      if (!sessionReady) {
        console.warn('[AUTH-DEBUG] mockLogin: Session not ready after polling, but continuing anyway')
      }

      // Get user session to trigger seed data generation
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (currentSession?.user) {
        console.log('[AUTH-DEBUG] mockLogin: Triggering seed data generation for user:', currentSession.user.id)
        // Trigger seed data generation (fire-and-forget)
        triggerSeedDataGeneration(currentSession.user.id)
      }

      toast.success("Mock Login Successful", {
        description: "Logged in as Test User",
      })

      // Explicitly navigate to dashboard if we're on an auth page or root
      // This ensures navigation happens reliably, even if middleware/home page redirect doesn't catch it
      const currentPath = window.location.pathname
      if (currentPath === '/auth/login' || currentPath === '/auth/register' || currentPath === '/') {
        console.log('[AUTH-DEBUG] mockLogin: Explicitly navigating to /dashboard from', currentPath)
        router.replace('/dashboard')
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error?.message || "Failed to perform mock login",
      })
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
        mockLogin,
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
