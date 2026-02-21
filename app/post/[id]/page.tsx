"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { CameraCapture } from "@/components/camera-capture" // CORRECTED IMPORT
import { getCurrentLocation } from "@/lib/mock-location"
import { formatSatsValue } from "@/lib/utils"
import { BitcoinLogo } from "@/components/bitcoin-logo"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { Post } from "@/lib/types"
import { reverseGeocode } from "@/lib/geocoding"
import { uploadImage, generateImagePath, isBase64Image } from "@/lib/storage"
// Add the new server actions to imports
import { markPostFixedAnonymouslyAction, submitAnonymousFixForReviewAction, submitLoggedInFixForReviewAction, closeIssueAction, deletePostAction, recordDeviceRejectionAction, updatePostExpirationAction } from "@/app/actions/post-actions"
import { User, Timer } from "lucide-react"
import { LightningInvoiceModal } from "@/components/lightning-invoice-modal"
import { AnonymousFixSubmissionModal } from "@/components/anonymous-fix-submission-modal"
import { v4 as uuidv4 } from "uuid"
import dynamic from "next/dynamic"
import PostDetailSkeleton from "@/components/post-detail-skeleton"
import { StaticMapWidget } from "@/components/static-map-widget"

// Dynamically import the map to avoid SSR issues with Google Maps
const PostDetailMap = dynamic(
  () => import("@/components/post-detail-map").then((mod) => mod.PostDetailMap),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl flex items-center justify-center">
        <span className="text-gray-400">Loading map...</span>
      </div>
    )
  }
)
// Removed direct import of sendIssueFixedEmail and sendFixSubmittedForReviewEmail - should only be called from server actions

export default function PostDetailPage({ params }: { params: { id: string } }) {
  // const { id } = useParams() // params.id is used directly
  const searchParams = useSearchParams()
  const [showAnonymousRewardOptions, setShowAnonymousRewardOptions] = useState(false)
  const [anonymousFixedPostId, setAnonymousFixedPostId] = useState<string | null>(null)
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [submittingFix, setSubmittingFix] = useState(false)
  const [fixImage, setFixImage] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showBeforeAfter, setShowBeforeAfter] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(getCurrentLocation())
  const [fixerProfile, setFixerProfile] = useState<{ name: string; username: string; avatar_url: string | null } | null>(null)
  const [fixerNote, setFixerNote] = useState("")
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const router = useRouter()
  const { user, profile, updateBalance, activeUserId, refreshProfile, connectedAccounts, mainAccountProfile, sessionLoaded } = useAuth() // user can be null for anonymous
  const supabase = createBrowserSupabaseClient()
  const [displayLocation, setDisplayLocation] = useState<string>("")
  const [isReviewing, setIsReviewing] = useState(false)
  const [showFullAnalysis, setShowFullAnalysis] = useState(false)
  const [showLightningModal, setShowLightningModal] = useState(false)
  const [showAnonymousFixSubmissionModal, setShowAnonymousFixSubmissionModal] = useState(false)
  const [pendingAnonymousFixPostId, setPendingAnonymousFixPostId] = useState<string | null>(null)
  const [showContent, setShowContent] = useState(false)
  const [showFullscreenImage, setShowFullscreenImage] = useState(false)
  const [fullscreenImageSrc, setFullscreenImageSrc] = useState<string | null>(null)
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  
  // Close issue dialog state
  const [showCloseIssueDialog, setShowCloseIssueDialog] = useState(false)
  const [selectedFixerUsername, setSelectedFixerUsername] = useState<string>("")
  const [fixerSearchQuery, setFixerSearchQuery] = useState<string>("")
  const [searchedFixerProfile, setSearchedFixerProfile] = useState<{ id: string; username: string; name: string; avatar_url: string | null } | null>(null)
  const [usernameSearchResults, setUsernameSearchResults] = useState<{ id: string; username: string; name: string; avatar_url: string | null }[]>([])
  const [isSearchingUsername, setIsSearchingUsername] = useState(false)
  const [hasSearchedUsername, setHasSearchedUsername] = useState(false)
  const [isClosingIssue, setIsClosingIssue] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeletingPost, setIsDeletingPost] = useState(false)
  const [familyMembers, setFamilyMembers] = useState<{ id: string; username: string; name: string; avatar_url: string | null; balance?: number }[]>([])
  
  // Expiration management state
  const [showExpirationEdit, setShowExpirationEdit] = useState(false)
  const [isSavingExpiration, setIsSavingExpiration] = useState(false)
  const [editExpiresAt, setEditExpiresAt] = useState<string | null>(null)
  
  // Group admin status - allows group admins to approve fixes for any post in their group
  const [isGroupAdmin, setIsGroupAdmin] = useState(false)
  const [groupAdminCheckComplete, setGroupAdminCheckComplete] = useState(false)
  
  // Device fix review - dedicated UI for reviewing device-submitted fixes
  const [showDeviceFixReview, setShowDeviceFixReview] = useState(false)
  const [deviceFixerProfile, setDeviceFixerProfile] = useState<{ id: string; username: string; name: string; avatar_url: string | null } | null>(null)
  const [isRejectingDeviceFix, setIsRejectingDeviceFix] = useState(false)

  // Fetch family_members for fixer suggestions
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      if (!user) return
      
      const { data, error } = await supabase
        .from('family_members')
        .select('member_id, profiles!family_members_member_id_fkey(id, username, name, avatar_url, balance)')
        .eq('user_id', user.id)
      
      if (error) {
        console.error('Error fetching family members:', error)
        return
      }
      
      const members = data
        ?.map((row: any) => row.profiles)
        .filter((profile: any) => profile !== null) || []
      
      setFamilyMembers(members)
    }
    
    fetchFamilyMembers()
  }, [user, supabase])

  // Check if user is a group admin for this post's group
  // This allows group admins to approve fixes for any post in their group
  useEffect(() => {
    const checkGroupAdminStatus = async () => {
      // Reset when user or post changes
      setIsGroupAdmin(false)
      setGroupAdminCheckComplete(false)
      
      // Need user, post, and post must be in a group
      if (!user || !post?.group_id) {
        // No group to check, mark as complete
        setGroupAdminCheckComplete(true)
        return
      }
      
      const effectiveUser = activeUserId || user.id
      
      const { data, error } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', post.group_id)
        .eq('user_id', effectiveUser)
        .eq('status', 'approved')
        .single()
      
      if (!error && data?.role === 'admin') {
        setIsGroupAdmin(true)
      }
      setGroupAdminCheckComplete(true)
    }
    
    checkGroupAdminStatus()
  }, [user, activeUserId, post?.group_id, supabase])

  // Handle ?verify=true&fixer=username query params (from SatoshiPet device email)
  useEffect(() => {
    const verify = searchParams.get('verify')
    const fixer = searchParams.get('fixer')
    
    // Only trigger once when post is loaded and we have the verify param
    // NOTE: We don't do frontend authorization checks here - let the backend handle it
    // This avoids race conditions with the async group admin check
    if (verify === 'true' && post && !post.fixed && !loading) {
      // SECURITY: Must be logged in to verify a fix
      if (!user) {
        // Redirect to login with return URL to come back here
        const returnUrl = `/post/${params.id}?verify=true${fixer ? `&fixer=${fixer}` : ''}`
        router.push(`/auth/login?redirect=${encodeURIComponent(returnUrl)}&reason=review_fix`)
        return
      }
      
      // Clear the query params from URL immediately to prevent re-triggering
      router.replace(`/post/${params.id}`, { scroll: false })
      
      // If fixer username is provided, show the dedicated device fix review UI
      if (fixer) {
        // Search for the fixer profile to display their info
        const searchFixer = async () => {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, name, avatar_url')
            .eq('username', fixer)
            .single()
          
          if (data) {
            setDeviceFixerProfile(data)
            setShowDeviceFixReview(true)
          } else {
            // Fixer not found, fall back to close issue dialog
            setSelectedFixerUsername(fixer)
            setShowCloseIssueDialog(true)
          }
        }
        searchFixer()
      } else {
        // No fixer specified, show regular close issue dialog
        setShowCloseIssueDialog(true)
      }
    }
  }, [searchParams, post, loading, supabase, router, params.id, user])

  // Fetch Bitcoin price on mount
  useEffect(() => {
    const fetchBitcoinPrice = async () => {
      try {
        const response = await fetch("/api/bitcoin-price")
        if (response.ok) {
          const data = await response.json()
          if (data.price && typeof data.price === 'number') {
            setBitcoinPrice(data.price)
          }
        }
      } catch (error) {
        console.warn("Failed to fetch Bitcoin price:", error)
      }
    }
    fetchBitcoinPrice()
  }, [])

  // Calculate USD value from sats
  const calculateUsdValue = (sats: number) => {
    if (!bitcoinPrice) return null
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPrice
    return usdValue.toFixed(2)
  }

  // Handle fullscreen image viewer
  const openFullscreenImage = (imageSrc: string) => {
    setFullscreenImageSrc(imageSrc)
    setShowFullscreenImage(true)
    // Prevent body scroll
    document.body.style.overflow = 'hidden'
  }

  const closeFullscreenImage = () => {
    setShowFullscreenImage(false)
    setFullscreenImageSrc(null)
    // Restore body scroll
    document.body.style.overflow = 'unset'
  }

  // Handle escape key to close fullscreen image
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showFullscreenImage) {
        closeFullscreenImage()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showFullscreenImage])

  // Handle share functionality
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/post/${params.id}`
    const shareText = `${post?.title || 'Check out this issue'} - ${displayLocation} ${shareUrl}`
    
    // Check if it's a mobile device
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    // Only use native share on mobile devices
    if (isMobile && navigator.share) {
      const shareData = {
        title: post?.title || 'Check out this issue',
        text: shareText, // Include URL in text for apps like Signal
      }
      
      try {
        await navigator.share(shareData)
      } catch (error) {
        // User cancelled or error occurred
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error)
        }
      }
    } else {
      // Always use clipboard on desktop - just the URL
      try {
        await navigator.clipboard.writeText(shareUrl)
        toast.success("Link copied!", {
          description: "Post link copied to clipboard",
        })
      } catch (error) {
        console.error('Error copying to clipboard:', error)
        toast.error("Error", {
          description: "Could not copy link",
        })
      }
    }
  }

  // Force hide bottom nav when camera is shown
  useEffect(() => {
    if (showCamera || showBeforeAfter) {
      document.body.classList.add("camera-active")
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (showCamera) {
          url.searchParams.set("camera", "active")
        }
        if (showBeforeAfter) {
          url.searchParams.set("comparison", "active")
        }
        window.history.replaceState({}, "", url.toString())
      }
    } else {
      document.body.classList.remove("camera-active")
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (url.searchParams.has("camera")) {
          url.searchParams.delete("camera")
        }
        if (url.searchParams.has("comparison")) {
          url.searchParams.delete("comparison")
        }
        window.history.replaceState({}, "", url.toString())
      }
    }
    return () => {
      document.body.classList.remove("camera-active")
    }
  }, [showCamera, showBeforeAfter])

  // Cleanup: ensure body scroll is restored when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset'
      document.body.classList.remove("camera-active")
    }
  }, [])

  // MOBILE FIX: Scroll to top on page mount to handle mobile browser URL bar state
  useEffect(() => {
    // Scroll to top immediately on mount
    window.scrollTo(0, 0)
    
    // Also reset scroll after a short delay to handle async rendering
    const timeoutId = setTimeout(() => {
      window.scrollTo(0, 0)
    }, 50)
    
    return () => clearTimeout(timeoutId)
  }, [])

  // EARLY LOGIN CHECK: If this is a verify flow and user isn't logged in, redirect to login first
  // This prevents "Post not found" for private group posts when user isn't authenticated
  useEffect(() => {
    const verify = searchParams.get('verify')
    const fixer = searchParams.get('fixer')
    
    // If this is a verify flow and user isn't authenticated, redirect to login
    // We check this BEFORE fetching the post because RLS will block the fetch for private groups
    // Wait for sessionLoaded to be true to avoid redirecting during initial auth check
    if (verify === 'true' && sessionLoaded && !user) {
      const returnUrl = `/post/${params.id}?verify=true${fixer ? `&fixer=${fixer}` : ''}`
      router.push(`/auth/login?redirect=${encodeURIComponent(returnUrl)}&reason=review_fix`)
    }
  }, [searchParams, user, sessionLoaded, params.id, router])

  // REVIEW FLOW: Handle ?review=true query param (from fix submitted email)
  // This ensures the user is logged in to see the review interface
  useEffect(() => {
    const review = searchParams.get('review')
    
    // If this is a review flow and user isn't authenticated, redirect to login
    if (review === 'true' && sessionLoaded && !user) {
      const returnUrl = `/post/${params.id}?review=true`
      router.push(`/auth/login?redirect=${encodeURIComponent(returnUrl)}&reason=review_fix`)
      return
    }
    
    // If user is logged in but not the post owner or group admin, show them an error
    // Wait for groupAdminCheckComplete to avoid race condition with async group admin check
    if (review === 'true' && sessionLoaded && user && post && !loading && groupAdminCheckComplete) {
      const isOwner = post.user_id === user.id || post.user_id === activeUserId
      const canReview = isOwner || isGroupAdmin
      
      if (!canReview) {
        toast.error("Not authorized", {
          description: "You need to be logged in as the issue owner or a group admin to review this fix.",
        })
        // Clear the review param but keep them on the page
        router.replace(`/post/${params.id}`, { scroll: false })
        return
      }
      
      // If authorized but post is not under review, let them know
      if (!post.under_review) {
        toast.info("No fix to review", {
          description: "This issue doesn't currently have a pending fix to review.",
        })
        router.replace(`/post/${params.id}`, { scroll: false })
        return
      }
      
      // Clear the review param - the UI will naturally show the review interface
      router.replace(`/post/${params.id}`, { scroll: false })
    }
  }, [searchParams, user, sessionLoaded, post, loading, activeUserId, isGroupAdmin, groupAdminCheckComplete, params.id, router])

  useEffect(() => {
    const fetchPost = async () => {
      try {
        if (supabase) {
          const { data, error } = await supabase
            .from("posts")
            .select(`
              *,
              group:group_id(
                id,
                name,
                description
              ),
              assigned_to_user:assigned_to(
                id,
                name
              )
            `)
            .eq("id", params.id)
            .single()
          if (data && !error) {
            setPost(data)
            setLoading(false)
            // Show content immediately for faster perceived performance
            setShowContent(true)
            return
          }
        }
      } catch (error) {
        console.error("Error fetching post:", error)
        toast.error("Error", {
          description: "Could not load the post details",
        })
      } finally {
        setLoading(false)
      }
    }
    fetchPost()
  }, [params.id, toast, supabase])

  // Initialize editExpiresAt from post data
  useEffect(() => {
    if (post?.expires_at) setEditExpiresAt(post.expires_at)
  }, [post?.expires_at])

  useEffect(() => {
    const handleStorageChange = () => {
      setCurrentLocation(getCurrentLocation())
    }
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  useEffect(() => {
    const convertLocation = async () => {
      if (post) {
        if (post.city) {
          setDisplayLocation(post.city)
          return
        }
        if (post.location && !post.location.includes(",")) {
          setDisplayLocation(post.location)
          return
        }
        if (post.latitude && post.longitude) {
          try {
            const cityName = await reverseGeocode(post.latitude, post.longitude)
            setDisplayLocation(cityName)
          } catch (error) {
            console.error("Error converting coordinates to city:", error)
            setDisplayLocation(post.location || "Unknown")
          }
        } else {
          setDisplayLocation(post.location || "Unknown")
        }
      }
    }
    convertLocation()
  }, [post])

  // Fetch fixer profile when post data is available and fixed_by exists
  useEffect(() => {
    const fetchFixerDetails = async () => {
      if (post?.fixed_by && supabase) {
        const { data, error } = await supabase
          .from("profiles")
          .select("name, username, avatar_url")
          .eq("id", post.fixed_by)
          .single()
        if (data) {
          setFixerProfile(data)
        } else {
          console.error("Error fetching fixer profile:", error?.message)
        }
      }
    }
    if (post?.fixed_by) {
      fetchFixerDetails()
    }
  }, [post?.fixed_by, supabase])

  const handleCaptureFixImage = (imageSrc: string) => {
    setFixImage(imageSrc)
    setShowCamera(false)
    setShowBeforeAfter(true)
  }

  const handleRetakePhoto = () => {
    setShowBeforeAfter(false)
    setShowCamera(true)
  }

  const handleSaveNote = () => {
    setShowNoteDialog(false)
    toast.success("Note saved", {
      description: "Your note has been added to the fix",
    })
  }

  const handleSubmitFix = async () => {
    if (!fixImage) {
      toast.error("Image required", {
        description: "Please take a photo of the fixed issue",
      })
      return
    }
    if (!post) {
      toast.error("Error", { description: "Post data not loaded." })
      return
    }

    setSubmittingFix(true)
    try {
      // Upload fix image to storage if it's base64
      let finalFixImageUrl = fixImage
      if (fixImage && isBase64Image(fixImage)) {
        console.log("📤 Uploading fix image to storage...")
        const imagePath = generateImagePath(user?.id || "anonymous", "fixes")
        const { url, error: uploadError } = await uploadImage(fixImage, imagePath)
        
        if (uploadError || !url) {
          console.error("Failed to upload fix image:", uploadError)
          toast.error("Upload Error", {
            description: "Failed to upload fix image. Please try again.",
          })
          setSubmittingFix(false)
          return
        }
        
        finalFixImageUrl = url
        console.log("✅ Fix image uploaded successfully")
      }

      console.log("🔍 FIX SUBMISSION - Starting AI verification process")
      const verificationResponse = await fetch("/api/verify-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beforeImage: post?.imageUrl || post?.image_url,
          afterImage: finalFixImageUrl,
          description: post?.description,
          title: post?.title,
        }),
      })
      console.log("🔍 FIX SUBMISSION - Verification API response status:", verificationResponse.status)
      if (!verificationResponse.ok) {
        const errorData = await verificationResponse.text()
        console.error("🔍 FIX SUBMISSION - AI Verification API Error:", errorData)
        throw new Error(`Failed to verify fix with AI. Status: ${verificationResponse.status}. ${errorData}`)
      }
      const verificationResult = await verificationResponse.json()
      console.log("🔍 FIX SUBMISSION - AI Verification Result:", verificationResult)

      // ANONYMOUS FIX HANDLING
      if (!user) {
        console.log("Anonymous user submitted fix. Confidence:", verificationResult.confidence)
        if (verificationResult.confidence >= 7) {
          // High confidence: Auto-approve anonymous fix
          const actionResult = await markPostFixedAnonymouslyAction(
            post.id,
            finalFixImageUrl || "",
            fixerNote,
            verificationResult.confidence,
            verificationResult.reasoning,
          )

          if (actionResult.success) {
            setPost((prevPost) =>
              prevPost
                ? {
                    ...prevPost,
                    fixed: true,
                    fixed_at: new Date().toISOString(),
                    fixed_by: null,
                    fixed_by_is_anonymous: true,
                    fixed_image_url: finalFixImageUrl || "",
                    fixer_note: fixerNote,
                    under_review: false,
                    ai_confidence_score: verificationResult.confidence,
                    ai_analysis: verificationResult.reasoning,
                  }
                : null,
            )
            toast.success("Fix Verified (Anonymous)!", {
              description: "Your fix has been successfully recorded. Thank you for your contribution!",
            })
            setAnonymousFixedPostId(post?.id || "")
            setShowAnonymousRewardOptions(true)
            setShowBeforeAfter(false)
            // Do not redirect yet, the UI will change based on showAnonymousRewardOptions
          } else {
            toast.error("Error Recording Fix", {
              description: actionResult.error || "Could not record your anonymous fix.",
            })
          }
        } else {
          // Low confidence: Submit anonymous fix for review
          const actionResult = await submitAnonymousFixForReviewAction(
            post.id,
            finalFixImageUrl || "",
            fixerNote,
            verificationResult.confidence,
            verificationResult.reasoning,
          )

          if (actionResult.success) {
            const nowIso = new Date().toISOString()
            setPost((prevPost) =>
              prevPost
                ? {
                    ...prevPost,
                    under_review: true,
                    submitted_fix_by_id: null,
                    submitted_fix_by_name: "Anonymous Fixer (Pending Review)",
                    submitted_fix_by_avatar: null,
                    submitted_fix_at: nowIso,
                    submitted_fix_image_url: finalFixImageUrl || "",
                    submitted_fix_note: fixerNote || "",
                    ai_confidence_score: verificationResult.confidence,
                    ai_analysis: verificationResult.reasoning,
                    fixed: false, // Ensure fixed is false as it's under review
                    fixed_by_is_anonymous: false, // Not yet fixed by anonymous
                  }
                : null,
            )
            // Show modal to prompt for Lightning address or account creation
            setPendingAnonymousFixPostId(post.id)
            setShowAnonymousFixSubmissionModal(true)
          } else {
            toast.error("Error Submitting for Review", {
              description: actionResult.error || "Could not submit your anonymous fix for review.",
            })
          }
        }
        setSubmittingFix(false)
        return
      }

      // Logged-in user fix handling (remains largely the same)
      if (verificationResult.confidence >= 7) {
        // ... (existing high-confidence logged-in user logic)
        console.log("🔍 FIX SUBMISSION - HIGH CONFIDENCE: Auto-approving fix for logged-in user")
        if (post && user && profile) {
          const now = new Date()
          const nowIso = now.toISOString()

          // Use server action to update post AND process reward
          // This is needed because RLS only allows post owners to update posts,
          // but the fixer may be a different user
          const { createFixRewardAction } = await import("@/app/actions/post-actions")
          const rewardResult = await createFixRewardAction({
            postId: post.id,
            userId: activeUserId || user?.id,
            reward: post?.reward || 0,
            postTitle: post?.title,
            // Pass fix details to also update the posts table
            fixDetails: {
              fixImageUrl: finalFixImageUrl || "",
              fixerNote: fixerNote || "",
              aiConfidence: verificationResult.confidence,
              aiAnalysis: verificationResult.reasoning || null,
            }
          })

          if (!rewardResult.success) {
            console.error("Error processing fix:", rewardResult.error)
            throw new Error(rewardResult.error || "Failed to process fix.")
          }
          
          console.log("🔍 FIX PROCESSED - Post marked as fixed and balance updated for user:", activeUserId || user?.id)
          console.log("💰 Manually refreshing profile to update UI")
          // Refresh profile to get updated balance
          await refreshProfile()

          // Update local state
          setPost((prevPost) =>
            prevPost
              ? {
                  ...prevPost,
                  fixed: true,
                  fixed_at: nowIso,
                  fixed_by: activeUserId || user?.id,
                  fixed_image_url: finalFixImageUrl || "",
                  fixer_note: fixerNote || "",
                  under_review: false,
                  ai_confidence_score: verificationResult.confidence,
                  ai_analysis: verificationResult.reasoning,
                  fixed_by_is_anonymous: false,
                }
              : null,
          )

          // The mockPosts update is likely not needed if Supabase is the source of truth
          // const postIndex = mockPosts.findIndex((p) => p.id === post.id)
          // if (postIndex !== -1) mockPosts[postIndex] = updatedPost

          // Balance update logic for logged-in user
          // This part might be redundant if updateBalance in useAuth already handles Supabase update
          // and local state update. The key is to ensure Supabase is updated first.
          // The updateBalance call above should handle the UI part.

          window.dispatchEvent(new Event("storage")) // To sync across tabs/components if needed
          router.push("/dashboard")
          // Show toast after navigation to prevent race condition
          setTimeout(() => {
            toast.success("🎊 Fix verified!", {
              description: `${formatSatsValue(post?.reward || 0)} sats have been added to your balance 💰`,
            })
          }, 100)
        }
      } else {
        // Low confidence for logged-in user: Submit for review
        console.log("🔍 FIX SUBMISSION - LOW CONFIDENCE: Submitting for review (logged-in user)")
        if (post && user) {
          const userId = activeUserId || user.id
          
          // Call server action to submit fix for review and send email
          const result = await submitLoggedInFixForReviewAction({
            postId: post.id,
            userId: userId,
            fixImageUrl: finalFixImageUrl || "",
            fixerNote: fixerNote,
            aiConfidence: verificationResult.confidence,
            aiAnalysis: verificationResult.reasoning
          })

          if (!result.success) {
            console.error("Error submitting fix for review:", result.error)
            throw new Error(result.error || "Failed to submit fix for review.")
          }

          const nowIso = new Date().toISOString()
          setPost((prevPost) =>
            prevPost
              ? {
                  ...prevPost,
                  under_review: true,
                  submitted_fix_by_id: userId,
                  submitted_fix_by_name: profile?.name || user?.email?.split("@")[0] || "Unknown User",
                  submitted_fix_by_avatar: profile?.avatar_url,
                  submitted_fix_at: nowIso,
                  submitted_fix_image_url: finalFixImageUrl || "",
                  submitted_fix_note: fixerNote || "",
                  ai_confidence_score: verificationResult.confidence,
                  ai_analysis: verificationResult.reasoning,
                  fixed: false,
                  fixed_by_is_anonymous: false,
                }
              : null,
          )
        }
        router.push("/dashboard")
        // Show toast after navigation to prevent race condition
        setTimeout(() => {
          toast("Fix submitted for review", {
            description: "Your fix has been submitted for review. The original poster will be notified to approve it.",
          })
        }, 100)
      }
    } catch (error) {
      console.error("🔍 FIX SUBMISSION - Error during verification or submission:", error)
      toast.error("Error", {
        description: `Could not process the fix: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    } finally {
      setSubmittingFix(false)
    }
  }

  const handleApproveFix = async () => {
    if (!post || !user) return
    setIsReviewing(true)
    try {
      if (supabase) {
        const nowIso = new Date().toISOString()
        const isAnonymousFixer = !post.submitted_fix_by_id
        
        // For anonymous fixers with Lightning address, try payment FIRST before marking as fixed
        if (isAnonymousFixer && post.submitted_fix_lightning_address) {
          const { payAnonymousFixLightningAddressAction } = await import("@/app/actions/post-actions")
          
          // First mark as fixed (required by payAnonymousFixLightningAddressAction)
          const { error: updateError } = await supabase
            .from("posts")
            .update({
              fixed: true,
              fixed_at: nowIso,
              fixed_by: null,
              fixed_by_is_anonymous: true,
              fixed_image_url: post.submitted_fix_image_url,
              fixer_note: post.submitted_fix_note,
              under_review: false,
            })
            .eq("id", post.id)
          
          if (updateError) {
            console.error("Error marking fix as approved:", updateError)
            throw new Error("Failed to approve fix")
          }
          
          // Now attempt payment
          const paymentResult = await payAnonymousFixLightningAddressAction(
            post.id,
            post.submitted_fix_lightning_address
          )

          if (!paymentResult.success) {
            console.error("Error paying Lightning address:", paymentResult.error)
            // Revert the fix status since payment failed
            await supabase
              .from("posts")
              .update({
                fixed: false,
                fixed_at: null,
                fixed_by: null,
                fixed_by_is_anonymous: false,
                under_review: true, // Keep under review so they can retry
              })
              .eq("id", post.id)
            
            toast.error("Payment Failed", {
              description: paymentResult.error || "Failed to send reward to Lightning address. Please try again or ask the fixer to provide a new invoice.",
            })
            return // Exit early - don't update local state to show as fixed
          }
          
          // Payment succeeded - update local state
          console.log('💰 Lightning payment successful:', paymentResult.paymentHash)
          setPost((prevPost) =>
            prevPost
              ? {
                  ...prevPost,
                  fixed: true,
                  fixed_at: nowIso,
                  fixed_by: null,
                  fixed_by_is_anonymous: true,
                  fixed_image_url: post.submitted_fix_image_url,
                  fixer_note: post.submitted_fix_note,
                  under_review: false,
                }
              : null,
          )
          toast.success("Fix approved!", {
            description: `${formatSatsValue(post.reward || 0)} sats sent via Lightning.`,
          })
        } else {
          // For logged-in users or anonymous without Lightning address
          const { error } = await supabase
            .from("posts")
            .update({
              fixed: true,
              fixed_at: nowIso,
              fixed_by: post.submitted_fix_by_id,
              fixed_by_is_anonymous: isAnonymousFixer,
              fixed_image_url: post.submitted_fix_image_url,
              fixer_note: post.submitted_fix_note,
              under_review: false,
            })
            .eq("id", post.id)
          
          if (error) {
            console.error("Error approving fix:", error)
            throw new Error("Failed to approve fix")
          }
          
          setPost((prevPost) =>
            prevPost
              ? {
                  ...prevPost,
                  fixed: true,
                  fixed_at: nowIso,
                  fixed_by: post.submitted_fix_by_id,
                  fixed_by_is_anonymous: isAnonymousFixer,
                  fixed_image_url: post.submitted_fix_image_url,
                  fixer_note: post.submitted_fix_note,
                  under_review: false,
                }
              : null,
          )
          
          // Handle reward payment for logged-in users
          if (post.submitted_fix_by_id) {
            const { createFixRewardAction } = await import("@/app/actions/post-actions")
            const rewardResult = await createFixRewardAction({
              postId: post.id,
              userId: post.submitted_fix_by_id,
              reward: post.reward || 0,
              postTitle: post.title,
              isPostOwnerClosing: true, // Post owner is approving another user's fix
            })

            if (!rewardResult.success) {
              console.error("Error creating fix reward transaction:", rewardResult.error)
              toast.error("Reward Error", {
                description: "Fix approved but reward transfer failed. Please contact support.",
              })
            } else {
              console.log('💰 Fix reward transaction created, balance updated to:', rewardResult.newBalance)
              
              // If the fixer is viewing this page, manually refresh their profile
              if (user && post.submitted_fix_by_id === (activeUserId || user.id)) {
                console.log('💰 Fixer is current user, manually refreshing profile')
                await refreshProfile()
              }
              toast.success("Fix approved!", {
                description: `${formatSatsValue(post.reward || 0)} sats sent to fixer.`,
              })
            }
          } else {
            // Anonymous user without Lightning address
            toast.success("Fix Approved", {
              description: "Fix approved! The anonymous fixer can claim the reward by creating an account.",
            })
          }
        }
      }
    } catch (error) {
      console.error("Error during fix approval:", error)
      toast.error("Error", { description: "Could not approve the fix" })
    } finally {
      setIsReviewing(false)
    }
  }

  const handleRejectFix = async () => {
    if (!post || !user) return
    setIsReviewing(true)
    try {
      if (supabase) {
        // Store the fixer ID before clearing it (needed for device notification)
        const fixerUserId = post.submitted_fix_by_id
        
        const { error } = await supabase
          .from("posts")
          .update({
            under_review: false,
            submitted_fix_by_id: null,
            submitted_fix_by_name: null,
            submitted_fix_by_avatar: null,
            submitted_fix_at: null,
            submitted_fix_image_url: null,
            submitted_fix_note: null,
          })
          .eq("id", post.id)
        if (error) {
          console.error("Error rejecting fix:", error)
          throw new Error("Failed to reject fix")
        }
        setPost((prevPost) =>
          prevPost
            ? {
                ...prevPost,
                under_review: false,
                submitted_fix_by_id: null,
                submitted_fix_by_name: null,
                submitted_fix_by_avatar: null,
                submitted_fix_at: null,
                submitted_fix_image_url: null,
                submitted_fix_note: null,
              }
            : null,
        )
        toast("❌ Fix rejected", {
          description: "The fix has been rejected. The issue is still open for others to fix.",
        })

        // Add activity for reject
        if (fixerUserId) {
          await supabase.from("activities").insert({
            id: uuidv4(),
            user_id: fixerUserId,
            type: "reject",
            related_id: post.id,
            related_table: "posts",
            timestamp: new Date().toISOString(),
            metadata: {},
          })
          
          // Notify the fixer's device (if they have one) about the rejection
          await recordDeviceRejectionAction({
            fixerUserId,
            postId: post.id,
            message: `"${post.title?.substring(0, 30) || 'Issue'}" was rejected`,
          })
        }
      }
    } catch (error) {
      console.error("Error during fix rejection:", error)
      toast.error("Error", { description: "Could not reject the fix" })
    } finally {
      setIsReviewing(false)
    }
  }

  // Check if current user is the original poster or a group admin
  // Group admins have the same authority as post owners for posts in their group
  const isOriginalPoster = post && user && (post.user_id === user.id || post.user_id === activeUserId)
  const canManagePost = isOriginalPoster || isGroupAdmin
  const canCloseIssue = canManagePost && !post?.fixed && !post?.under_review && !post?.deleted_at

  // Get available fixers (family members, excluding self)
  const getAvailableFixers = () => {
    // Use a Map to deduplicate by ID
    const fixerMap = new Map<string, { id: string; username: string; name: string; avatar_url: string | null; balance?: number }>()
    
    // Add connected accounts (child accounts)
    ;(connectedAccounts || []).forEach(account => {
      if (account?.id && account?.username) {
        fixerMap.set(account.id, {
          id: account.id,
          username: account.username,
          name: account.name || '',
          avatar_url: account.avatar_url,
          balance: account.balance
        })
      }
    })
    
    // Add family members (quick contacts)
    familyMembers.forEach(member => {
      if (member?.id && member?.username && !fixerMap.has(member.id)) {
        fixerMap.set(member.id, member)
      }
    })
    
    // If viewing from child account, add main account at the start
    if (activeUserId && user && mainAccountProfile && mainAccountProfile.username) {
      const mainEntry = {
        id: mainAccountProfile.id,
        username: mainAccountProfile.username,
        name: mainAccountProfile.name || '',
        avatar_url: mainAccountProfile.avatar_url,
        balance: mainAccountProfile.balance
      }
      // Remove if already exists, then add to start
      fixerMap.delete(mainAccountProfile.id)
      return [mainEntry, ...Array.from(fixerMap.values())]
    }
    
    // Don't filter out the poster - self-assignment is allowed
    return Array.from(fixerMap.values())
  }

  // Search for users by username (partial match)
  const searchFixerByUsername = async (username: string) => {
    const cleanUsername = username.startsWith('@') ? username.substring(1) : username
    
    if (cleanUsername.length < 2) {
      setUsernameSearchResults([])
      setHasSearchedUsername(false)
      return
    }
    
    setIsSearchingUsername(true)
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, name, avatar_url')
      .ilike('username', `${cleanUsername}%`)
      .limit(4)
    
    setIsSearchingUsername(false)
    setHasSearchedUsername(true)
    
    if (!error && data && data.length > 0) {
      setUsernameSearchResults(data)
    } else {
      setUsernameSearchResults([])
    }
  }

  // Debounced username search effect
  useEffect(() => {
    const cleanQuery = fixerSearchQuery.startsWith('@') ? fixerSearchQuery.substring(1) : fixerSearchQuery
    
    if (cleanQuery.length < 2) {
      setUsernameSearchResults([])
      setHasSearchedUsername(false)
      return
    }

    const timeoutId = setTimeout(() => {
      searchFixerByUsername(fixerSearchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [fixerSearchQuery])

  // Handle close issue submit
  const handleCloseIssue = async () => {
    if (!post || !selectedFixerUsername) return
    
    setIsClosingIssue(true)
    try {
      const effectiveUserId = activeUserId || user?.id
      if (!effectiveUserId) {
        toast.error("Error", { description: "You must be logged in" })
        return
      }

      const result = await closeIssueAction(post.id, effectiveUserId, selectedFixerUsername)
      
      if (result.success) {
        toast.success("Issue Closed", {
          description: `Reward sent to @${selectedFixerUsername}`,
        })
        setShowCloseIssueDialog(false)
        // Refresh the post data
        const { data: updatedPost } = await supabase
          .from("posts")
          .select("*")
          .eq("id", post.id)
          .single()
        if (updatedPost) {
          setPost(updatedPost as Post)
        }
        await refreshProfile()
      } else {
        toast.error("Error", { description: result.error || "Failed to close issue" })
      }
    } catch (error) {
      console.error("Error closing issue:", error)
      toast.error("Error", { description: "An unexpected error occurred" })
    } finally {
      setIsClosingIssue(false)
    }
  }

  // Handle delete post
  const handleDeletePost = async () => {
    if (!post) return
    
    setIsDeletingPost(true)
    try {
      const effectiveUserId = activeUserId || user?.id
      if (!effectiveUserId) {
        toast.error("Error", { description: "You must be logged in" })
        return
      }

      const result = await deletePostAction(post.id, effectiveUserId)
      
      if (result.success) {
        // Refresh profile to update balance in UI
        await refreshProfile()
        toast.success("Post Deleted", {
          description: "Your post has been deleted and reward refunded",
        })
        router.push("/dashboard")
      } else {
        toast.error("Error", { description: result.error || "Failed to delete post" })
      }
    } catch (error) {
      console.error("Error deleting post:", error)
      toast.error("Error", { description: "An unexpected error occurred" })
    } finally {
      setIsDeletingPost(false)
      setShowDeleteConfirm(false)
    }
  }

  // Handle update expiration
  const handleUpdateExpiration = async (newExpiresAt: string | null) => {
    const effectiveUserId = activeUserId || user?.id
    if (!effectiveUserId || !post) return
    setIsSavingExpiration(true)
    try {
      const result = await updatePostExpirationAction(post.id, effectiveUserId, newExpiresAt)
      if (result.success) {
        setPost(prev => prev ? { ...prev, expires_at: newExpiresAt } : prev)
        setEditExpiresAt(newExpiresAt)
        setShowExpirationEdit(false)
        toast.success(newExpiresAt ? 'Expiration updated' : 'Expiration removed')
      } else {
        toast.error('Error', { description: result.error || 'Failed to update expiration' })
      }
    } finally {
      setIsSavingExpiration(false)
    }
  }

  // Handle reject device-submitted fix
  // This is for when a fixer was pre-selected (from device email) but the poster determines it's not actually fixed  
  const handleRejectDeviceFix = async () => {
    if (!post || !selectedFixerUsername || !searchedFixerProfile) return
    
    setIsRejectingDeviceFix(true)
    try {
      // Notify the fixer's device about the rejection
      await recordDeviceRejectionAction({
        fixerUserId: searchedFixerProfile.id,
        postId: post.id,
        message: `"${post.title?.substring(0, 30) || 'Issue'}" was rejected`,
      })
      
      toast("❌ Submission rejected", {
        description: "The fixer has been notified. The issue is still open.",
      })
      
      // Clear the selected fixer and close dialog
      setSelectedFixerUsername("")
      setSearchedFixerProfile(null)
      setShowCloseIssueDialog(false)
    } catch (error) {
      console.error("Error rejecting device fix:", error)
      toast.error("Error", { description: "Failed to send rejection notification" })
    } finally {
      setIsRejectingDeviceFix(false)
    }
  }

  const getFixerInitials = () => {
    if (!fixerProfile?.name) return "U"
    return fixerProfile.name
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase()
  }

  const formatFixerName = () => {
    if (!fixerProfile?.name) return "Unknown User"
    const nameParts = fixerProfile.name.split(" ")
    const firstName = nameParts[0] || ""
    const lastInitial = nameParts.length > 1 ? `${nameParts[nameParts.length - 1].charAt(0)}.` : ""
    return `${firstName} ${lastInitial}`.trim()
  }

  // Remove early return for loading - let our overlay system handle it

  if (!loading && !post) {
    return (
      <div className="container px-4 py-6 mx-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Post not found</h1>
          <p className="mt-2 text-muted-foreground">The post you're looking for doesn't exist or has been removed.</p>
          <Button className="mt-4" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  // THIS IS THE CORRECT WAY TO HANDLE CAMERA DISPLAY
  if (showCamera) {
    return (
      <div className="relative w-screen h-screen bg-black">
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-black/50 text-white/70 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
            Take a photo
          </div>
        </div>
        <CameraCapture onCapture={handleCaptureFixImage} />
      </div>
    )
  }

  if (showBeforeAfter) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md comparison-page" data-comparison-active="true">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" onClick={() => setShowBeforeAfter(false)} className="mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {" "}
              <path d="m15 18-6-6 6-6" />{" "}
            </svg>
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-2xl font-bold">Submit fix</h1>
        </div>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="relative w-full h-48 overflow-hidden rounded-lg">
                <Image
                  src={post?.imageUrl || post?.image_url || "/placeholder.svg"}
                  alt="Before"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-2 left-2">
                  {" "}
                  <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">Before</span>{" "}
                </div>
              </div>
            </div>
            <div>
              <div className="relative w-full h-48 overflow-hidden rounded-lg">
                <Image src={fixImage || "/placeholder.svg"} alt="After" fill className="object-cover" />
                <div className="absolute top-2 left-2">
                  {" "}
                  <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">After</span>{" "}
                </div>
                <div className="absolute top-2 right-2 flex space-x-1">
                  <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-black/50 hover:bg-black/70 text-white border-0 p-2"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {" "}
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />{" "}
                        </svg>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        {" "}
                        <DialogTitle>Add a note</DialogTitle>{" "}
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="note">Note (optional)</Label>
                          <Textarea
                            id="note"
                            placeholder="Add any details about how you fixed this issue..."
                            value={fixerNote}
                            onChange={(e) => setFixerNote(e.target.value)}
                            className="mt-1"
                            rows={4}
                          />
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
                            {" "}
                            Cancel{" "}
                          </Button>
                          <Button onClick={handleSaveNote}>Save note</Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleRetakePhoto}
                    className="bg-black/50 hover:bg-black/70 text-white border-0 p-2"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {" "}
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />{" "}
                      <circle cx="12" cy="12" r="3" />{" "}
                    </svg>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              {" "}
              <h3 className="font-semibold text-lg">{post?.title}</h3>{" "}
            </div>
            <div className="flex items-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
              <div className="p-2 mr-3 bg-amber-100 rounded-full dark:bg-amber-950/50">
                {" "}
                <BitcoinLogo size={16} />{" "}
              </div>
              <div>
                <p className="text-sm font-medium">Reward</p>
                <p className="text-lg font-bold">{formatSatsValue(post?.reward || 0)}</p>
              </div>
            </div>
            {fixerNote && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <p className="text-sm font-medium mb-1">Your note:</p>
                <p className="text-sm text-muted-foreground">{fixerNote}</p>
              </div>
            )}
          </div>
          <Button
            onClick={handleSubmitFix}
            disabled={submittingFix}
            className="w-full h-12 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold"
          >
            {submittingFix ? (
              <div className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  {" "}
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>{" "}
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>{" "}
                </svg>
                Verifying...
              </div>
            ) : (
              "Claim Reward"
            )}
          </Button>
        </div>
        {/* Anonymous Fix Submission Modal - must be inside this return for anonymous users */}
        {pendingAnonymousFixPostId && (
          <AnonymousFixSubmissionModal
            open={showAnonymousFixSubmissionModal}
            onOpenChange={setShowAnonymousFixSubmissionModal}
            postId={pendingAnonymousFixPostId}
            rewardAmount={post?.reward || 0}
            onLightningAddressSubmitted={() => {
              toast.success("Lightning Address Saved", {
                description: "If your fix is approved, your reward will be sent to this address.",
              })
              setPendingAnonymousFixPostId(null)
              router.push("/")
            }}
            onAccountCreationRequested={() => {
              setPendingAnonymousFixPostId(null)
            }}
          />
        )}
      </div>
    )
  }

  // Device Fix Review - early return when reviewing a device-submitted fix
  if (showDeviceFixReview && deviceFixerProfile && post && post.user_id != null) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        {/* Header */}
        <div className="flex items-center mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              setShowDeviceFixReview(false)
              setDeviceFixerProfile(null)
            }} 
            className="mr-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-xl font-bold">Review Fix</h1>
        </div>

        <div className="space-y-4">
          {/* Issue Image + Device Notice Side by Side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Original Issue Image */}
            <div className="relative w-full h-40 overflow-hidden rounded-lg">
              {post.image_url ? (
                <Image src={post.image_url} alt="Issue" fill className="object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-muted-foreground text-sm">No image</span>
                </div>
              )}
              <div className="absolute top-2 left-2">
                <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">Before</span>
              </div>
            </div>

            {/* Device Submission Notice (replaces "After" photo) */}
            <div className="relative w-full h-40 overflow-hidden rounded-lg bg-amber-950/30 border border-amber-700/50 flex flex-col items-center justify-center p-3">
              <div className="text-2xl mb-1">🐾</div>
              <p className="text-xs font-medium text-amber-200 text-center">SatoshiPet</p>
              <p className="text-[10px] text-amber-300/70 text-center mt-1">No photo taken</p>
              <div className="absolute top-2 left-2">
                <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">After</span>
              </div>
            </div>
          </div>

          {/* Issue Title + Fixer + Reward - Compact Row */}
          <div className="space-y-3">
            <h3 className="font-semibold">{post.title}</h3>
            
            {/* Fixer and Reward in a row */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={deviceFixerProfile.avatar_url ?? undefined} alt={deviceFixerProfile.name || "User"} />
                  <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{deviceFixerProfile.name}</p>
                  <p className="text-xs text-muted-foreground">@{deviceFixerProfile.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-full">
                <BitcoinLogo size={14} />
                <span className="font-bold text-sm">{formatSatsValue(post.reward || 0)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={async () => {
                setIsClosingIssue(true)
                try {
                  const effectiveUserId = activeUserId || user?.id
                  if (!effectiveUserId) {
                    toast.error("Error", { description: "You must be logged in" })
                    return
                  }
                  const result = await closeIssueAction(post.id, effectiveUserId, deviceFixerProfile.username)
                  if (result.success) {
                    toast.success("Fix Approved!", {
                      description: `${formatSatsValue(post.reward || 0)} sent to @${deviceFixerProfile.username}`,
                    })
                    setShowDeviceFixReview(false)
                    setDeviceFixerProfile(null)
                    const { data: updatedPost } = await supabase.from("posts").select("*").eq("id", post.id).single()
                    if (updatedPost) setPost(updatedPost as Post)
                    await refreshProfile()
                  } else {
                    toast.error("Error", { description: result.error || "Failed to approve fix" })
                  }
                } catch (error) {
                  console.error("Error approving fix:", error)
                  toast.error("Error", { description: "An unexpected error occurred" })
                } finally {
                  setIsClosingIssue(false)
                }
              }}
              disabled={isClosingIssue}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {isClosingIssue ? "Processing..." : `Approve & Pay ${formatSatsValue(post.reward || 0)}`}
            </Button>
            
            <Button
              variant="outline"
              onClick={async () => {
                setIsRejectingDeviceFix(true)
                try {
                  await recordDeviceRejectionAction({
                    fixerUserId: deviceFixerProfile.id,
                    postId: post.id,
                    message: `"${post.title?.substring(0, 30) || 'Issue'}" was rejected`,
                  })
                  toast("❌ Fix Rejected", { description: "The fixer has been notified. The issue is still open." })
                  setShowDeviceFixReview(false)
                  setDeviceFixerProfile(null)
                } catch (error) {
                  console.error("Error rejecting fix:", error)
                  toast.error("Error", { description: "Failed to reject fix" })
                } finally {
                  setIsRejectingDeviceFix(false)
                }
              }}
              disabled={isRejectingDeviceFix}
              className="w-full text-orange-500 border-orange-500 hover:bg-orange-500/10"
            >
              {isRejectingDeviceFix ? "Sending..." : "Not Fixed Yet"}
            </Button>
            
            <button
              onClick={() => {
                setShowDeviceFixReview(false)
                setDeviceFixerProfile(null)
                setShowCloseIssueDialog(true)
              }}
              className="w-full text-sm text-muted-foreground hover:text-foreground py-2"
            >
              Wrong person? Select a different fixer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main content of the page when not in camera or before/after view

  return (
    <div className="relative">
      {!showContent && (
        <div className="absolute inset-0 z-10 transition-opacity duration-150 opacity-100">
          <PostDetailSkeleton />
        </div>
      )}
      
      {/* Real Content: fades in when showContent is true */}
      <div className={`transition-opacity duration-150 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
        {post && (
          <>
            {/* Desktop: Side-by-side layout | Mobile: Single column */}
            <div className="lg:flex lg:h-[calc(100vh-64px)] lg:overflow-hidden bg-white dark:bg-gray-900">
              {/* Left Panel - Post Details (scrollable) */}
              <div className="w-full lg:w-[380px] xl:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto lg:border-r lg:border-gray-200 lg:dark:border-gray-800">
                <div className="container px-4 pt-4 pb-6 lg:pt-4 lg:pb-8 mx-auto max-w-md lg:max-w-none">
            {/* Updated image display logic to handle anonymous reviews */}
            {/* Show before/after for post owner, group admins, or completed fixes */}
            {/* Fixed takes priority over under_review */}
            {((post.fixed && post.fixed_image_url) ||
            (!post.fixed && post.under_review &&
            post.submitted_fix_image_url &&
            user &&
            post.user_id != null &&
            (post.userId === user.id || post.user_id === user.id || post.user_id === activeUserId || isGroupAdmin))) ? (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <div 
                  className="relative w-full h-40 overflow-hidden rounded-lg cursor-pointer transition-opacity hover:opacity-90"
                  onClick={() => openFullscreenImage(post.imageUrl || post.image_url || "/placeholder.svg")}
                >
                  <Image
                    src={post.imageUrl || post.image_url || "/placeholder.svg"}
                    alt="Before"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">Before</span>
                  </div>
                </div>
              </div>
              <div>
                <div 
                  className="relative w-full h-40 overflow-hidden rounded-lg cursor-pointer transition-opacity hover:opacity-90"
                  onClick={() => openFullscreenImage((post.fixed ? post.fixed_image_url : post.submitted_fix_image_url) || "/placeholder.svg")}
                >
                  <Image
                    src={(post.fixed ? post.fixed_image_url : post.submitted_fix_image_url) || "/placeholder.svg"}
                    alt="After"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">After</span>
                  </div>
                  {/* Action buttons overlaid on top-right */}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleShare()
                      }}
                      className="bg-black/50 hover:bg-black/70 text-white border-0 p-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" x2="12" y1="2" y2="15" />
                      </svg>
                      <span className="sr-only">Share</span>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push("/dashboard")
                      }}
                      className="bg-black/50 hover:bg-black/70 text-white border-0 p-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                      <span className="sr-only">Close</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div 
              className="relative w-full h-64 mb-4 overflow-hidden rounded-lg cursor-pointer transition-opacity hover:opacity-95"
              onClick={() => openFullscreenImage(post.imageUrl || post.image_url || "/placeholder.svg")}
            >
              <Image
                src={post.imageUrl || post.image_url || "/placeholder.svg"}
                alt={post.title}
                fill
                className="object-cover"
              />
              {/* Action buttons overlaid on top-right */}
              <div className="absolute top-2 right-2 flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={(e) => {
                    e.stopPropagation()
                    handleShare()
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white border-0 p-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" x2="12" y1="2" y2="15" />
                  </svg>
                  <span className="sr-only">Share</span>
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push("/dashboard")
                  }}
                  className="bg-black/50 hover:bg-black/70 text-white border-0 p-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>
          )}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold mb-1">{post.title}</h2>
              <div className="flex flex-col gap-1">
              {/* First line: Status, Time ago, and Creator */}
              <div className="flex items-center text-sm text-muted-foreground flex-wrap gap-x-2">
                {/* Status indicators are mutually exclusive: fixed takes priority over under_review */}
                {post.fixed ? (
                  <>
                    <div className="flex items-center whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                      <span>
                        Fixed{fixerProfile?.username && ` by @${fixerProfile.username}`}
                      </span>
                    </div>
                    <span className="hidden sm:inline">•</span>
                  </>
                ) : post.under_review ? (
                  <>
                    <div className="flex items-center whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5"></span>
                      <span>Under Review</span>
                    </div>
                    <span className="hidden sm:inline">•</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
                      <span>Open</span>
                    </div>
                    <span className="hidden sm:inline">•</span>
                  </>
                )}
                {/* Time ago */}
                <span className="whitespace-nowrap">
                  {formatDistanceToNow(new Date(post.fixed ? (post.fixed_at || post.createdAt || post.created_at) : (post.createdAt || post.created_at || Date.now())), { addSuffix: false })
                    .replace("about ", "")
                    .replace(" hours", " hrs")
                    .replace(" minutes", " mins")}{" "}
                  ago
                </span>
                {/* Creator */}
                {!post.fixed && post.created_by && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <span className="whitespace-nowrap">Created by {post.created_by.split(' ').map((name, i, arr) => i === arr.length - 1 && arr.length > 1 ? name.charAt(0) : name).join(' ')}</span>
                  </>
                )}
              </div>
              </div>
              {!post.fixed && post.under_review && post.submitted_fix_by_name && (
                <div className="flex items-center mt-1 text-sm text-muted-foreground">
                  <span>Fix submitted by {post.submitted_fix_by_name}</span>
                </div>
              )}
            </div>
            
            {/* Bitcoin Map Marker with Sats Reward on the right - EXACT copy from dashboard */}
            <div style={{ position: "relative", width: "48px", height: "48px" }}>
              <div
                className="marker-container"
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#FED56B",
                  border: "1px solid #C5792D",
                  boxShadow: "0 0 0 1px #F4C14F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src="/images/bitcoin-logo.png"
                  alt="Bitcoin"
                  width={43}
                  height={43}
                  style={{ zIndex: 1 }}
                />
              </div>
              {/* Badge absolutely positioned over the coin */}
              <div
                style={{
                  position: "absolute",
                  bottom: "-20px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#fff",
                  color: "black",
                  padding: "2px 10px",
                  fontSize: "14.4px",
                  fontWeight: "bold",
                  borderRadius: "14.4px",
                  border: "1px solid #F7931A",
                  boxShadow: "0 2px 3px rgba(0, 0, 0, 0.1)",
                  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                  minWidth: "24px",
                  textAlign: "center",
                  zIndex: 3,
                  pointerEvents: "auto",
                  width: "max-content",
                }}
              >
                {(() => {
                  const sats = post.reward
                  if (sats === 0) return "0"
                  if (sats < 1000) return sats.toString()
                  const inK = sats / 1000
                  if (inK === Math.floor(inK)) {
                    return `${Math.floor(inK)}k`
                  }
                  return `${inK.toFixed(1)}k`.replace(".0k", "k")
                })()}
              </div>
            </div>
            
            <style jsx>{`
              .marker-container {
                position: relative;
                overflow: hidden;
              }
              .marker-container::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(
                  120deg,
                  rgba(255, 255, 255, 0) 30%,
                  rgba(255, 255, 255, 0.5) 50%,
                  rgba(255, 255, 255, 0) 70%
                );
                transform: rotate(0deg);
                animation: shine 2.5s infinite ease-in-out;
                z-index: 2;
                pointer-events: none;
              }
              @keyframes shine {
                0% {
                  transform: translate(-100%, -100%) rotate(25deg);
                }
                100% {
                  transform: translate(100%, 100%) rotate(25deg);
                }
              }
            `}</style>
          </div>
          
          {/* Map Widget - Mobile only (hidden on desktop where we have side map) */}
          {post.latitude && post.longitude && (
            <div className="mb-4 lg:hidden">
              <StaticMapWidget
                latitude={Number(post.latitude)}
                longitude={Number(post.longitude)}
                title={post.title}
                locationLabel={displayLocation}
                height={160}
              />
            </div>
          )}
          
          {!post.fixed && post.under_review && post.submitted_fix_image_url && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-6">
              <div className="flex items-center mb-1">
                {" "}
                <p className="text-sm font-medium">AI Review</p>{" "}
              </div>
              <div className="text-sm text-muted-foreground">
                {showFullAnalysis ? (
                  <div>
                    {post.ai_analysis || "The AI analysis is not available for this submission."}
                    <button onClick={() => setShowFullAnalysis(false)} className="text-white hover:underline ml-1">
                      {" "}
                      Show less{" "}
                    </button>
                  </div>
                ) : (
                  <div className="line-clamp-3">
                    {post.ai_analysis && post.ai_analysis.length > 150 ? (
                      <>
                        {post.ai_analysis.slice(0, 150)}
                        <button onClick={() => setShowFullAnalysis(true)} className="text-white hover:underline">
                          {" "}
                          ...see more{" "}
                        </button>
                      </>
                    ) : (
                      post.ai_analysis || "The AI analysis is not available for this submission."
                    )}
                  </div>
                )}
              </div>
              {post.ai_confidence_score && (
                <div className="mt-2 text-xs text-muted-foreground">Confidence Score: {post.ai_confidence_score}/10</div>
              )}
            </div>
          )}
          {post.fixed && post.fixer_note && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border">
              <h3 className="font-medium mb-2">Fixer's note:</h3>
              <p className="text-sm text-muted-foreground">{post.fixer_note}</p>
            </div>
          )}
          {/* Check if this is the post owner or group admin viewing a fix under review */}
          {!post.fixed &&
          post.under_review &&
          post.submitted_fix_image_url &&
          user &&
          post.user_id != null &&
          (post.userId === user.id || post.user_id === user.id || post.user_id === activeUserId || isGroupAdmin) ? (
            // Show review interface for post owner or group admin
            <div className="space-y-4 mb-6">
              {post.submitted_fix_note && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-sm font-medium mb-1">Fixer's note:</p>
                  <p className="text-sm text-muted-foreground">{post.submitted_fix_note}</p>
                </div>
              )}
              <Card className="border dark:border-gray-800">
                <CardContent className="p-3">
                  <div className="flex items-center">
                    <div className="p-2 mr-3 bg-amber-100 rounded-full dark:bg-amber-950/50">
                      <BitcoinLogo size={16} />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatSatsValue(post.reward)}</p>
                      <p className="text-sm font-medium text-muted-foreground">Reward</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="flex space-x-3">
                <Button onClick={handleApproveFix} disabled={isReviewing} className="flex-1 w-full">
                  {isReviewing ? (
                    <div className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processing...
                    </div>
                  ) : (
                    "Approve & Pay Reward"
                  )}
                </Button>
                <Button onClick={handleRejectFix} disabled={isReviewing} variant="outline" className="flex-1">
                  Reject Fix
                </Button>
              </div>
            </div>
          ) : null}
          {showAnonymousRewardOptions && anonymousFixedPostId === post.id && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-md">
                <CardContent className="p-8 text-center">
                  <h2 className="text-2xl font-bold mb-4">Fix Approved!</h2>
                  <p className="text-lg mb-6 text-muted-foreground">
                    You earned
                  </p>
                  
                  {/* Prominent reward amount */}
                  <div className="mb-2">
                    <div className="flex items-center justify-center gap-2">
                      <BitcoinLogo size={32} />
                      <span className="text-5xl font-bold">{post.reward.toLocaleString()}</span>
                      <span className="text-3xl font-normal text-muted-foreground">sats</span>
                    </div>
                    {calculateUsdValue(post.reward) && (
                      <p className="text-lg text-muted-foreground mt-2">
                        ${calculateUsdValue(post.reward)} USD
                      </p>
                    )}
                  </div>
                  
                  <p className="mb-8 text-sm text-muted-foreground">
                    Withdraw your sats now or create an account to save your earnings.
                  </p>
                  
                  <div className="space-y-3">
                    <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowLightningModal(true)}>
                      Withdraw {formatSatsValue(post.reward)}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        // Store anonymous reward info in localStorage for claiming after signup
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('pending_anonymous_reward_post', anonymousFixedPostId || '')
                          localStorage.setItem('pending_anonymous_reward_amount', post.reward.toString())
                        }
                        router.push(`/auth/register?postId=${anonymousFixedPostId}`)
                      }}
                    >
                      Create Account & Save Reward
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <LightningInvoiceModal
            open={showLightningModal}
            onOpenChange={setShowLightningModal}
            rewardAmount={post.reward}
            postId={post.id}
            onSuccess={() => {
              // Immediately hide UI to prevent re-submission
              setShowAnonymousRewardOptions(false)
              setShowLightningModal(false)
              setAnonymousFixedPostId(null)
              
              // Clear localStorage to prevent showing option again on refresh
              if (typeof window !== 'undefined') {
                localStorage.removeItem('pending_anonymous_reward_post')
                localStorage.removeItem('pending_anonymous_reward_amount')
              }
              
              toast.success("Reward Claimed!", {
                description: `${formatSatsValue(post.reward)} sats sent to your Lightning wallet`,
              })
              router.push("/")
            }}
          />
          {pendingAnonymousFixPostId && (
            <AnonymousFixSubmissionModal
              open={showAnonymousFixSubmissionModal}
              onOpenChange={setShowAnonymousFixSubmissionModal}
              postId={pendingAnonymousFixPostId}
              rewardAmount={post.reward}
              onLightningAddressSubmitted={() => {
                toast.success("Lightning Address Saved", {
                  description: "If your fix is approved, your reward will be sent to this address.",
                })
                setPendingAnonymousFixPostId(null)
                router.push("/")
              }}
              onAccountCreationRequested={() => {
                setPendingAnonymousFixPostId(null)
              }}
            />
          )}
          {!post.fixed && !post.under_review && !post.deleted_at && (
            <Button className="w-full h-12 mt-6 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold" onClick={() => setShowCamera(true)}>Start</Button>
          )}
          
          {/* Expiration management - only visible to original poster */}
          {isOriginalPoster && !post.fixed && !post.deleted_at && (
            <div className="mt-4">
              {post.expires_at && !showExpirationEdit ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Timer className="w-4 h-4" />
                  <span>Expires {formatDistanceToNow(new Date(post.expires_at), { addSuffix: true })}</span>
                  <button type="button" onClick={() => setShowExpirationEdit(true)}
                    className="text-xs underline hover:text-foreground">Edit</button>
                  <button type="button" onClick={() => handleUpdateExpiration(null)}
                    className="text-xs text-red-500 hover:text-red-600"
                    disabled={isSavingExpiration}>Remove</button>
                </div>
              ) : !post.expires_at && !showExpirationEdit ? (
                <button type="button" onClick={() => setShowExpirationEdit(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Timer className="w-3.5 h-3.5" /> Add expiration
                </button>
              ) : null}
              {showExpirationEdit && (
                <div className="flex flex-wrap gap-2 items-center mt-2">
                  {[{label:'1 hr',hrs:1},{label:'12 hrs',hrs:12},{label:'1 day',hrs:24},
                    {label:'3 days',hrs:72},{label:'7 days',hrs:168}].map(({label,hrs}) => (
                    <button key={label} type="button"
                      onClick={() => setEditExpiresAt(new Date(Date.now()+hrs*3600_000).toISOString())}
                      className="px-3 py-1 rounded-full text-xs border border-gray-300 hover:border-gray-400">
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => handleUpdateExpiration(editExpiresAt)}
                    disabled={isSavingExpiration}
                    className="px-3 py-1 rounded-full text-xs bg-green-600 text-white">
                    {isSavingExpiration ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setShowExpirationEdit(false)}
                    className="text-xs text-muted-foreground">Cancel</button>
                </div>
              )}
            </div>
          )}
          
          {/* Mark Complete button - only visible to original poster */}
          {canCloseIssue && (
            <Button 
              variant="outline" 
              className="w-full h-12 mt-4 text-lg font-semibold"
              onClick={() => {
                setSelectedFixerUsername("")
                setFixerSearchQuery("")
                setSearchedFixerProfile(null)
                setShowCloseIssueDialog(true)
              }}
            >
              Mark Complete
            </Button>
          )}

          {/* Deleted post banner */}
          {post.deleted_at && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 font-medium text-center">
                This post has been deleted
              </p>
            </div>
          )}
                </div>
              </div>
              {/* End Left Panel */}

              {/* Right Panel - Map (Desktop only) */}
              {post.latitude && post.longitude && (
                <div className="hidden lg:block flex-1 relative">
                  <PostDetailMap post={post} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Close Issue Dialog */}
      {showCloseIssueDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-background border rounded-lg p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Close Issue</h3>
                <button
                  onClick={() => setShowCloseIssueDialog(false)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Who fixed it? They will get the {formatSatsValue(post?.reward || 0)} reward.
              </p>
              
              {/* Family member quick select - horizontal scroll */}
              {getAvailableFixers().length > 0 && (
                <div 
                  className="flex overflow-x-auto scrollbar-hide gap-3 py-2 -mx-2 px-2"
                  style={{ 
                    scrollbarWidth: 'none', 
                    msOverflowStyle: 'none'
                  }}
                >
                  {getAvailableFixers().map((account) => (
                    <button
                      key={account.id}
                      onClick={() => {
                        // Toggle selection - deselect if already selected
                        if (selectedFixerUsername === account.username) {
                          setSelectedFixerUsername("")
                        } else {
                          setSelectedFixerUsername(account.username || "")
                        }
                        setFixerSearchQuery("")
                        setUsernameSearchResults([])
                        setHasSearchedUsername(false)
                      }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all flex-shrink-0 min-w-[68px] ${
                        selectedFixerUsername === account.username 
                          ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500' 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={`Assign to ${account.name}`}
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={account.avatar_url ?? undefined}
                          alt={account.name || "User"}
                        />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[60px]">
                        {account.name?.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Username search */}
              <div className="space-y-2">
                <input
                  type="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Or search by @username"
                  value={fixerSearchQuery}
                  onChange={(e) => setFixerSearchQuery(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                />
                
                {/* Search results / feedback */}
                {fixerSearchQuery.length >= 2 && (
                  <div className="space-y-1">
                    {isSearchingUsername ? (
                      <p className="text-sm text-muted-foreground px-1">Searching...</p>
                    ) : hasSearchedUsername && usernameSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1">No matching users</p>
                    ) : usernameSearchResults.length > 0 ? (
                      <div className="space-y-1">
                        {usernameSearchResults.map((result) => (
                          <button
                            key={result.id}
                            onClick={() => {
                              setSelectedFixerUsername(result.username)
                              setFixerSearchQuery('')
                              setUsernameSearchResults([])
                              setHasSearchedUsername(false)
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                              selectedFixerUsername === result.username 
                                ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500' 
                                : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage
                                src={result.avatar_url ?? undefined}
                                alt={result.name || "User"}
                              />
                              <AvatarFallback>
                                <User className="h-4 w-4" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="text-left min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{result.name}</p>
                              <p className="text-xs text-muted-foreground truncate">@{result.username}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              
              {/* Selected fixer display */}
              {selectedFixerUsername && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    <span className="font-medium">@{selectedFixerUsername}</span> will receive {formatSatsValue(post?.reward || 0)}
                  </p>
                </div>
              )}
              
              {/* Action buttons */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={handleCloseIssue}
                  disabled={!selectedFixerUsername || isClosingIssue}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {isClosingIssue ? "Processing..." : "Confirm & Send Reward"}
                </Button>
                
                {/* Not Fixed Yet button - only show when a fixer is selected (e.g., from device email) */}
                {selectedFixerUsername && searchedFixerProfile && (
                  <Button
                    variant="outline"
                    onClick={handleRejectDeviceFix}
                    disabled={isRejectingDeviceFix}
                    className="w-full text-orange-600 border-orange-200 hover:bg-orange-50 dark:border-orange-800 dark:hover:bg-orange-950/30"
                  >
                    {isRejectingDeviceFix ? "Sending..." : "Not Fixed Yet"}
                  </Button>
                )}
                
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                  <span className="flex-shrink mx-4 text-xs text-muted-foreground">or</span>
                  <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                </div>
                
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCloseIssueDialog(false)
                    setShowDeleteConfirm(true)
                  }}
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                >
                  Delete Post Instead
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Delete Post?</h3>
              <p className="text-sm text-muted-foreground">
                This will remove the post. Your {formatSatsValue(post?.reward || 0)} reward will be refunded to your wallet.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1"
                  disabled={isDeletingPost}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeletePost}
                  disabled={isDeletingPost}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {isDeletingPost ? "Deleting..." : "Delete Post"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Viewer */}
      {showFullscreenImage && fullscreenImageSrc && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={closeFullscreenImage}
        >
          <button
            onClick={closeFullscreenImage}
            className="absolute top-4 right-4 z-[101] w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            aria-label="Close fullscreen image"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div
            className="relative w-full h-full max-w-7xl max-h-screen p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={fullscreenImageSrc}
              alt="Fullscreen view"
              fill
              className="object-contain"
              quality={100}
            />
          </div>
        </div>
      )}
    </div>
  )
}

