"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation" // Combined useParams from next/navigation
import Image from "next/image"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
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
import { markPostFixedAnonymouslyAction, submitAnonymousFixForReviewAction } from "@/app/actions/post-actions" // Adjust path if necessary
import { LightningInvoiceModal } from "@/components/lightning-invoice-modal"
import { v4 as uuidv4 } from "uuid"
import dynamic from "next/dynamic"
import PostDetailSkeleton from "@/components/post-detail-skeleton"
import { StaticMapWidget } from "@/components/static-map-widget"
import { sendIssueFixedEmail } from "@/lib/transaction-emails"

export default function PostDetailPage({ params }: { params: { id: string } }) {
  // const { id } = useParams() // params.id is used directly
  const [showAnonymousRewardOptions, setShowAnonymousRewardOptions] = useState(false)
  const [anonymousFixedPostId, setAnonymousFixedPostId] = useState<string | null>(null)
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [submittingFix, setSubmittingFix] = useState(false)
  const [fixImage, setFixImage] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showBeforeAfter, setShowBeforeAfter] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(getCurrentLocation())
  const [fixerProfile, setFixerProfile] = useState<{ name: string; avatar_url: string | null } | null>(null)
  const [fixerNote, setFixerNote] = useState("")
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const { user, profile, updateBalance, activeUserId, refreshProfile } = useAuth() // user can be null for anonymous
  const supabase = createBrowserSupabaseClient()
  const [displayLocation, setDisplayLocation] = useState<string>("")
  const [isReviewing, setIsReviewing] = useState(false)
  const [showFullAnalysis, setShowFullAnalysis] = useState(false)
  const [showLightningModal, setShowLightningModal] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [showFullscreenImage, setShowFullscreenImage] = useState(false)
  const [fullscreenImageSrc, setFullscreenImageSrc] = useState<string | null>(null)
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)

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
        toast({
          title: "Link copied!",
          description: "Post link copied to clipboard",
          duration: 2000,
        })
      } catch (error) {
        console.error('Error copying to clipboard:', error)
        toast({
          title: "Error",
          description: "Could not copy link",
          variant: "destructive",
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
        toast({
          title: "Error",
          description: "Could not load the post details",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    fetchPost()
  }, [params.id, toast, supabase])

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
          .select("name, avatar_url")
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
    toast({
      title: "Note saved",
      description: "Your note has been added to the fix",
    })
  }

  const handleSubmitFix = async () => {
    if (!fixImage) {
      toast({
        title: "Image required",
        description: "Please take a photo of the fixed issue",
        variant: "destructive",
      })
      return
    }
    if (!post) {
      toast({ title: "Error", description: "Post data not loaded.", variant: "destructive" })
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
          toast({
            title: "Upload Error",
            description: "Failed to upload fix image. Please try again.",
            variant: "destructive",
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
            toast({
              title: "Fix Verified (Anonymous)!",
              description: "Your fix has been successfully recorded. Thank you for your contribution!",
              variant: "success",
              duration: 2000,
            })
            setAnonymousFixedPostId(post?.id || "")
            setShowAnonymousRewardOptions(true)
            setShowBeforeAfter(false)
            // Do not redirect yet, the UI will change based on showAnonymousRewardOptions
          } else {
            toast({
              title: "Error Recording Fix",
              description: actionResult.error || "Could not record your anonymous fix.",
              variant: "destructive",
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
            toast({
              title: "Fix Submitted for Review (Anonymous)",
              description: "Your fix has low AI confidence and has been submitted for manual review. Thank you!",
              duration: 2000,
            })
            router.push("/") // Redirect to homepage/map for now after submitting for review
          } else {
            toast({
              title: "Error Submitting for Review",
              description: actionResult.error || "Could not submit your anonymous fix for review.",
              variant: "destructive",
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

          if (supabase) {
            const { error } = await supabase
              .from("posts")
              .update({
                fixed: true,
                fixed_at: nowIso,
                fixed_by: activeUserId || user?.id,
                fixed_image_url: finalFixImageUrl || "",
                fixer_note: fixerNote || "",
                under_review: false, // Clear review status
                ai_confidence_score: verificationResult.confidence, // Store AI score
                ai_analysis: verificationResult.reasoning, // Store AI reasoning
                fixed_by_is_anonymous: false, // Explicitly false for logged-in user
              })
              .eq("id", post?.id)
            if (error) {
              console.error("Error updating post in Supabase:", error)
              throw new Error("Failed to update post in database.")
            }

            // Update fixer's profile: balance and fixed_issues_count
            const { data: fixerProfileData, error: profileError } = await supabase
              .from("profiles")
              .select("balance, fixed_issues_count")
              .eq("id", activeUserId || user?.id)
              .single()

            if (profileError) {
              console.error("Error fetching fixer profile for update:", profileError)
              // Decide if this is critical enough to stop the process
            } else if (fixerProfileData) {
              const newBalance = (fixerProfileData.balance || 0) + (post?.reward || 0)
              const newFixedCount = (fixerProfileData.fixed_issues_count || 0) + 1
              const { error: updateProfileError } = await supabase
                .from("profiles")
                .update({ balance: newBalance, fixed_issues_count: newFixedCount })
                .eq("id", activeUserId || user?.id)
              if (updateProfileError) {
                console.error("Error updating fixer profile (balance/count):", updateProfileError)
              } else {
                console.log("🔍 BALANCE UPDATE - Profile balance and count updated for user:", activeUserId || user?.id)
                console.log("💰 Manually refreshing profile to update UI")
                // Refresh profile to update the UI immediately
                await refreshProfile()
              }
            }

            // Add activity for fix submission
            await supabase.from("activities").insert({
              id: uuidv4(),
              user_id: activeUserId || user?.id,
              type: "fix",
              related_id: post?.id,
              related_table: "posts",
              timestamp: nowIso,
              metadata: { 
                title: post?.title,
                reward: post?.reward,
                fixed: true,
                fixerNote, 
                ai_confidence: verificationResult.confidence 
              },
            })

            // Send email notification to post owner (only if they have verified email and it's not their own fix)
            if (post?.user_id && post.user_id !== (activeUserId || user?.id)) {
              const { data: ownerProfile } = await supabase
                .from("profiles")
                .select("email, name")
                .eq("id", post.user_id)
                .single()

              if (ownerProfile?.email && !ownerProfile.email.includes('@ganamos.app')) {
                // Send email asynchronously (don't block on email sending)
                sendIssueFixedEmail({
                  toEmail: ownerProfile.email,
                  userName: ownerProfile.name || "User",
                  issueTitle: post.title || "Your issue",
                  fixerName: profile?.name || "Someone",
                  rewardAmount: post.reward || 0,
                  date: now,
                  postId: post.id
                }).catch(error => {
                  console.error("Error sending issue fixed email:", error)
                  // Don't fail the fix submission if email fails
                })
              }
            }
          }

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
          toast({
            title: "🎊 Fix verified!",
            description: `${formatSatsValue(post?.reward || 0)} sats have been added to your balance 💰`,
            variant: "success",
            duration: 2000,
          })
          router.push("/dashboard")
        }
      } else {
        // Low confidence for logged-in user: Submit for review
        console.log("🔍 FIX SUBMISSION - LOW CONFIDENCE: Submitting for review (logged-in user)")
        if (post && supabase && user && profile) {
          const nowIso = new Date().toISOString()
          const { error } = await supabase
            .from("posts")
            .update({
              under_review: true,
              submitted_fix_by_id: activeUserId || user?.id,
              submitted_fix_by_name: profile?.name || user?.email?.split("@")[0] || "Unknown User",
              submitted_fix_by_avatar: profile?.avatar_url,
              submitted_fix_at: nowIso,
              submitted_fix_image_url: finalFixImageUrl || "",
              submitted_fix_note: "",
              ai_confidence_score: verificationResult.confidence,
              ai_analysis: verificationResult.reasoning,
              fixed: false, // Ensure not marked as fixed
              fixed_by_is_anonymous: false, // Not an anonymous submission
            })
            .eq("id", post?.id)
          if (error) {
            console.error("Error updating post review status:", error)
            throw new Error("Failed to submit fix for review.")
          }
          setPost((prevPost) =>
            prevPost
              ? {
                  ...prevPost,
                  under_review: true,
                  submitted_fix_by_id: activeUserId || user?.id,
                  submitted_fix_by_name: profile?.name || user?.email?.split("@")[0] || "Unknown User",
                  submitted_fix_by_avatar: profile?.avatar_url,
                  submitted_fix_at: nowIso,
                  submitted_fix_image_url: finalFixImageUrl || "",
                  submitted_fix_note: "",
                  ai_confidence_score: verificationResult.confidence,
                  ai_analysis: verificationResult.reasoning,
                  fixed: false,
                  fixed_by_is_anonymous: false,
                }
              : null,
          )
        }
        toast({
          title: "Fix submitted for review",
          description: "Your fix has been submitted for review. The original poster will be notified to approve it.",
        })
        router.push("/dashboard")
      }
    } catch (error) {
      console.error("🔍 FIX SUBMISSION - Error during verification or submission:", error)
      toast({
        title: "Error",
        description: `Could not process the fix: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
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
        const { error } = await supabase
          .from("posts")
          .update({
            fixed: true,
            fixed_at: nowIso,
            fixed_by: post.submitted_fix_by_id,
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
                fixed_image_url: post.submitted_fix_image_url,
                fixer_note: post.submitted_fix_note,
                under_review: false,
              }
            : null,
        )
        if (post.submitted_fix_by_id) {
          const { data: fixerProfileData, error: profileError } = await supabase
            .from("profiles")
            .select("balance")
            .eq("id", post.submitted_fix_by_id)
            .single()
          if (profileError) console.error("Error getting fixer profile:", profileError)
          else if (fixerProfileData) {
            const newBalance = (fixerProfileData.balance || 0) + post.reward
            console.log('💰 Updating fixer balance from', fixerProfileData.balance, 'to', newBalance)
            await supabase.from("profiles").update({ balance: newBalance }).eq("id", post.submitted_fix_by_id)
            
            // If the fixer is viewing this page, manually refresh their profile
            if (user && post.submitted_fix_by_id === (activeUserId || user.id)) {
              console.log('💰 Fixer is current user, manually refreshing profile')
              await refreshProfile()
            }
          }
        }
        toast({
          title: "Fix approved",
          description: "The fix has been approved and the reward has been transferred.",
          variant: "success",
        })

        // Add single activity for fix (includes reward info)
        await supabase.from("activities").insert({
          id: uuidv4(),
          user_id: post.submitted_fix_by_id,
          type: "fix",
          related_id: post.id,
          related_table: "posts",
          timestamp: nowIso,
          metadata: { 
            title: post.title,
            reward: post.reward,
            fixed: true
          },
        })
      }
    } catch (error) {
      console.error("Error during fix approval:", error)
      toast({ title: "Error", description: "Could not approve the fix", variant: "destructive" })
    } finally {
      setIsReviewing(false)
    }
  }

  const handleRejectFix = async () => {
    if (!post || !user) return
    setIsReviewing(true)
    try {
      if (supabase) {
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
        toast({
          title: "❌ Fix rejected",
          description: "The fix has been rejected. The issue is still open for others to fix.",
          variant: "default",
        })

        // Add activity for reject
        await supabase.from("activities").insert({
          id: uuidv4(),
          user_id: post.submitted_fix_by_id,
          type: "reject",
          related_id: post.id,
          related_table: "posts",
          timestamp: new Date().toISOString(),
          metadata: {},
        })
      }
    } catch (error) {
      console.error("Error during fix rejection:", error)
      toast({ title: "Error", description: "Could not reject the fix", variant: "destructive" })
    } finally {
      setIsReviewing(false)
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
            className="w-full bg-green-600 hover:bg-green-700 text-white"
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
              "Submit Fix"
            )}
          </Button>
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
          <div className="container px-4 pt-4 pb-6 mx-auto max-w-md">
            {/* Updated image display logic to handle anonymous reviews */}
            {((post.under_review &&
            post.submitted_fix_image_url &&
            user &&
            (post.userId === user.id || post.user_id === user.id || post.user_id === activeUserId)) ||
          (post.fixed && post.fixed_image_url)) ? (
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
                  onClick={() => openFullscreenImage((post.under_review ? post.submitted_fix_image_url : post.fixed_image_url) || "/placeholder.svg")}
                >
                  <Image
                    src={(post.under_review ? post.submitted_fix_image_url : post.fixed_image_url) || "/placeholder.svg"}
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
                {post.fixed && (
                  <>
                    <div className="flex items-center whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                      <span>Fixed</span>
                    </div>
                    <span className="hidden sm:inline">•</span>
                  </>
                )}
                {post.under_review && (
                  <>
                    <div className="flex items-center whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5"></span>
                      <span>Under Review</span>
                    </div>
                    <span className="hidden sm:inline">•</span>
                  </>
                )}
                {!post.fixed && !post.under_review && (
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
                  {formatDistanceToNow(new Date(post.createdAt || post.created_at || Date.now()), { addSuffix: false })
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
              {post.under_review && post.submitted_fix_by_name && (
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
          
          {/* Map Widget - shows location of the issue */}
          {post.latitude && post.longitude && (
            <div className="mb-4">
              <StaticMapWidget
                latitude={Number(post.latitude)}
                longitude={Number(post.longitude)}
                title={post.title}
                locationLabel={displayLocation}
                height={160}
              />
            </div>
          )}
          
          {post.under_review && post.submitted_fix_image_url && (
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
          {/* Check if this is the post owner viewing an anonymous fix under review */}
          {post.under_review &&
          post.submitted_fix_image_url &&
          user &&
          (post.userId === user.id || post.user_id === user.id || post.user_id === activeUserId) ? (
            // Show review interface for post owner
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
              setShowAnonymousRewardOptions(false)
              toast({
                title: "Reward Claimed!",
                description: `${formatSatsValue(post.reward)} sats sent to your Lightning wallet`,
                variant: "success",
              })
              router.push("/")
            }}
          />
          {!post.fixed && !post.under_review && (
            <Button className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold" onClick={() => setShowCamera(true)}>Submit</Button>
          )}
          </div>
        )}
      </div>

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
