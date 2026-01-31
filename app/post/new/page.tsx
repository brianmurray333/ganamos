"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { toast } from "sonner"
import { useAuth } from "@/components/auth-provider"
import { v4 as uuidv4 } from "@/lib/uuid"
import { formatSatsValue } from "@/lib/utils"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import type { Group } from "@/lib/types"
import { uploadImage, generateImagePath, isBase64Image } from "@/lib/storage"
import {
  createPostFundingInvoiceAction,
  checkPostFundingStatusAction,
  createFundedAnonymousPostAction,
} from "@/app/actions/post-actions"
import QRCode from "@/components/qr-code"
import { getCurrentLocationWithName } from "@/lib/geocoding" // Import the geocoding utility
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import { ChevronLeft, Search, User, Users, Globe, Lock, X } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { LoadingSpinner } from "@/components/loading-spinner"
import { LocationEditorModal } from "@/components/location-editor-modal"
import { CreateGroupDialog } from "@/components/create-group-dialog"
import { ShareGroupModal } from "@/components/share-group-modal"

// Pre-load the camera component
import dynamic from "next/dynamic"
const DynamicCameraCapture = dynamic(
  () => import("@/components/camera-capture").then((mod) => ({ default: mod.CameraCapture })),
  {
    ssr: false,
    loading: () => <LoadingSpinner message="Loading camera..." />,
  },
)

export default function NewPostPage() {
  const [description, setDescription] = useState("")
  const [reward, setReward] = useState(2000)
  const [image, setImage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<"photo" | "details">("photo")
  const [currentLocation, setCurrentLocation] = useState<{
    name: string
    lat: number
    lng: number
    displayName?: string // Keep displayName for UI consistency
  } | null>(null)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [userGroups, setUserGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  // Assignment state - can be public, a group, or a specific person
  const [assignedTo, setAssignedTo] = useState<string | null>(null) // UUID of assigned user
  const [assignedToProfile, setAssignedToProfile] = useState<{id: string, name: string, username: string, avatar_url?: string} | null>(null)
  const [familyMembers, setFamilyMembers] = useState<{id: string, name: string, username: string, avatar_url?: string}[]>([])
  const [showUsernameSearch, setShowUsernameSearch] = useState(false)
  const [usernameSearchQuery, setUsernameSearchQuery] = useState("")
  const [usernameSearchResults, setUsernameSearchResults] = useState<{id: string, name: string, username: string, avatar_url?: string}[]>([])
  const [isSearchingUsername, setIsSearchingUsername] = useState(false)
  const previousSelectValueRef = useRef<string | null>(null)
  const router = useRouter()
  const { user, profile, updateBalance, activeUserId, refreshProfile } = useAuth()
  const supabase = createBrowserSupabaseClient()
  const [showKeypad, setShowKeypad] = useState(false)
  const isAnonymous = !user
  const MIN_ANONYMOUS_REWARD = 500
  const [fundingPaymentRequest, setFundingPaymentRequest] = useState<string | null>(null)
  const [fundingRHash, setFundingRHash] = useState<string | null>(null)
  const [isAwaitingPayment, setIsAwaitingPayment] = useState(false)
  const [showFundingModal, setShowFundingModal] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const postCreationRef = useRef(false) // Prevent duplicate post creation
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false)
  const [lastCreatedPostId, setLastCreatedPostId] = useState<string | null>(null)
  const [locationErrorCount, setLocationErrorCount] = useState(0)
  const [showFullInvoice, setShowFullInvoice] = useState(false)
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [cameraActive, setCameraActive] = useState(true)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [groupPickerHighlighted, setGroupPickerHighlighted] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false)
  const [showShareGroupModal, setShowShareGroupModal] = useState(false)
  const [pendingGroup, setPendingGroup] = useState<Group | null>(null)

  useEffect(() => {
    if (isAnonymous) {
      setReward((prev: number) => Math.max(prev, MIN_ANONYMOUS_REWARD))
    }
  }, [isAnonymous])

  // Check if there's a selected group from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedGroupId = localStorage.getItem("selectedGroupId")
      if (storedGroupId) {
        setSelectedGroupId(storedGroupId)
        // Clear it after using it
        localStorage.removeItem("selectedGroupId")
      }
    }
  }, [])

  // Fetch user's groups only when they reach the details step (after taking photo)
  useEffect(() => {
    if (step !== "details") return // Only fetch when on details step
    const userId = activeUserId || user?.id
    if (!userId) return
    async function fetchUserGroups() {
      setLoadingGroups(true)
      try {
        // Fetch groups where the user is an approved member
        const { data: memberGroups, error: memberError } = await supabase
          .from("group_members")
          .select(`
            group_id,
            groups:group_id(
              id,
              name,
              description,
              created_by,
              created_at,
              updated_at,
              invite_code
            )
          `)
          .eq("user_id", userId)
          .eq("status", "approved")

        if (memberError) {
          console.error("Error fetching user groups:", memberError)
          throw memberError
        }

        // Transform the data to match the Group interface
        const transformedGroups = memberGroups
          .filter((item: any) => item.groups) // Filter out any null groups
          .map((item: any) => item.groups as Group)

        setUserGroups(transformedGroups)
      } catch (error) {
        console.error("Error in fetchUserGroups:", error)
        toast.error("Error", {
          description: "Failed to load your groups. You can still post without selecting a group.",
        })
      } finally {
        setLoadingGroups(false)
      }
    }
    fetchUserGroups()
  }, [user, activeUserId, supabase, toast, step])

  // Fetch family members (connected accounts) when on details step
  useEffect(() => {
    if (step !== "details") return
    if (!user?.id) return
    
    async function fetchFamilyMembers() {
      try {
        // Fetch connected accounts where user is the primary
        const { data: connections, error: connError } = await supabase
          .from("connected_accounts")
          .select("connected_user_id")
          .eq("primary_user_id", user!.id)
        
        if (connError) {
          console.error("Error fetching connected accounts:", connError)
          return
        }
        
        if (connections && connections.length > 0) {
          const userIds = connections.map(c => c.connected_user_id)
          
          // Fetch profiles for connected users
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, name, username, avatar_url")
            .in("id", userIds)
            .neq("status", "deleted")
          
          if (profilesError) {
            console.error("Error fetching family profiles:", profilesError)
            return
          }
          
          setFamilyMembers(profiles || [])
        }
      } catch (error) {
        console.error("Error fetching family members:", error)
      }
    }
    
    fetchFamilyMembers()
  }, [user, supabase, step])

  // Search for username
  useEffect(() => {
    if (!usernameSearchQuery.trim() || usernameSearchQuery.length < 2) {
      setUsernameSearchResults([])
      return
    }
    
    const searchTimeout = setTimeout(async () => {
      setIsSearchingUsername(true)
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, name, username, avatar_url")
          .ilike("username", `%${usernameSearchQuery}%`)
          .neq("status", "deleted")
          .limit(10)
        
        if (error) {
          console.error("Error searching usernames:", error)
          return
        }
        
        // Filter out current user
        const filtered = (data || []).filter(p => p.id !== (activeUserId || user?.id))
        setUsernameSearchResults(filtered)
      } catch (error) {
        console.error("Error in username search:", error)
      } finally {
        setIsSearchingUsername(false)
      }
    }, 300) // Debounce
    
    return () => clearTimeout(searchTimeout)
  }, [usernameSearchQuery, supabase, user, activeUserId])

  // Polling for payment status
  useEffect(() => {
    if (isAwaitingPayment && fundingRHash) {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          console.log("Polling for payment status for rHash:", fundingRHash)
          const statusResult = await checkPostFundingStatusAction(fundingRHash)
          if (statusResult.success && statusResult.settled && !postCreationRef.current) {
            // CRITICAL: Set lock immediately to prevent duplicate creation
            postCreationRef.current = true
            console.log("Payment confirmed for rHash:", fundingRHash)
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
            setIsAwaitingPayment(false)
            setShowFundingModal(false)
            toast.success("Payment Confirmed!", {
              description: "Your payment has been received. Creating your post...",
            })

            // Now create the funded anonymous post
            const postDetails = {
              description,
              reward,
              image_url: image,
              location: currentLocation?.name || null, // Use the name from geocoding
              latitude: currentLocation?.lat || null,
              longitude: currentLocation?.lng || null,
              city: currentLocation?.displayName || currentLocation?.name || null, // Use displayName or fallback to name
              funding_r_hash: fundingRHash,
              funding_payment_request: fundingPaymentRequest!,
            }

            const creationResult = await createFundedAnonymousPostAction(postDetails)
            if (creationResult.success && creationResult.postId) {
              setLastCreatedPostId(creationResult.postId)
              toast.success("🎉 Anonymous Post Created!", {
                description: "Your issue has been posted successfully.",
              })
              setShowCreateAccountPrompt(true)
            } else {
              toast.error("Error Creating Post", {
                description: creationResult.error || "Failed to create post after payment.",
              })
            }
            setIsSubmitting(false)
            setFundingPaymentRequest(null)
            setFundingRHash(null)
          } else if (!statusResult.success) {
            console.error("Error polling payment status:", statusResult.error)
          }
        } catch (error) {
          console.error("Exception during payment polling:", error)
        }
      }, 5000)
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [
    isAwaitingPayment,
    fundingRHash,
    description,
    reward,
    image,
    currentLocation,
    toast,
    router, // router was here before, keeping it for consistency with the revert
    fundingPaymentRequest,
  ])

  // Fetch Bitcoin price when user reaches details step (after taking photo)
  useEffect(() => {
    if (step !== "details") return // Only fetch when on details step
    async function fetchBitcoinPrice() {
      try {
        const response = await fetch("/api/bitcoin-price")
        
        if (response.ok) {
          const data = await response.json()
          if (data.price && typeof data.price === 'number') {
            setBitcoinPrice(data.price)
          } else {
            setBitcoinPrice(null)
          }
        } else {
          setBitcoinPrice(null)
        }
      } catch (error) {
        console.warn("Failed to fetch Bitcoin price:", error)
        setBitcoinPrice(null)
      } finally {
        setIsPriceLoading(false)
      }
    }
    fetchBitcoinPrice()
  }, [step])

  // Load Google Maps for location autocomplete
  useEffect(() => {
    const loadGoogleMapsLocal = async () => {
      if (typeof window === 'undefined') return
      
      try {
        await loadGoogleMaps()
        console.log('Google Maps loaded successfully')
      } catch (error) {
        console.error('Failed to load Google Maps:', error)
      }
    }

    loadGoogleMapsLocal()
  }, [])

  // Auto-focus description when entering details step
  // Focus immediately to trigger mobile keyboard - don't wait for location fetching
  // Mobile browsers require focus within ~100ms of user interaction to show keyboard
  useEffect(() => {
    if (step === "details" && descriptionRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready while staying in user interaction window
      requestAnimationFrame(() => {
        if (descriptionRef.current) {
          descriptionRef.current.focus()
        }
      })
    }
  }, [step])

  const calculateUsdValue = (sats: number) => {
    if (!bitcoinPrice) return null
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPrice
    return usdValue.toFixed(2)
  }

  const handleCapture = async (imageSrc: string) => {
    setImage(imageSrc)
    setCameraActive(false)
    
    // Force stop all media streams immediately
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        // Get all video elements and clear their sources
        const videos = document.querySelectorAll('video')
        videos.forEach((video) => {
          if (video.srcObject) {
            const stream = video.srcObject as MediaStream
            stream.getTracks().forEach(track => {
              track.stop()
              console.log('🛑 Force stopped track:', track.kind)
            })
            video.srcObject = null
            video.pause()
            video.load()
          }
        })
      } catch (error) {
        console.error('Error force-stopping camera:', error)
      }
    }
    
    // Wait a moment for browser to release camera
    await new Promise(resolve => setTimeout(resolve, 100))
    
    setStep("details")

    // Automatically get current location when taking a photo with in-app camera
    // Since the photo is being taken right now, the issue is at the user's current location
    setIsGettingLocation(true)
    try {
      const locationInfo = await getCurrentLocationWithName({ forceRefresh: false, useCache: true })

      if (locationInfo) {
        setCurrentLocation({
          name: locationInfo.name,
          lat: locationInfo.latitude,
          lng: locationInfo.longitude,
          displayName: locationInfo.name,
        })
        console.log('✅ Auto-populated location from current position:', locationInfo.name)
      }
    } catch (error) {
      console.log('Could not get current location:', error)
      // Non-critical error - user can manually select location
    } finally {
      setIsGettingLocation(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error("Invalid file", {
        description: "Please select an image file",
      })
      return
    }

    // Convert to base64
    const reader = new FileReader()
    reader.onload = async (e) => {
      const imageData = e.target?.result as string
      setImage(imageData)
      setCameraActive(false)
      setStep("details")

      // Try to extract GPS location from EXIF data
      try {
        const { extractExifLocation } = await import('@/lib/exif')
        const exifLocation = await extractExifLocation(file)
        
        if (exifLocation) {
          console.log('📍 Found GPS in photo EXIF:', exifLocation)
          setIsGettingLocation(true)
          
          // Reverse geocode to get location name
          const { reverseGeocode, getStandardizedLocation } = await import('@/lib/geocoding')
          const name = await reverseGeocode(exifLocation.latitude, exifLocation.longitude)
          const standardized = await getStandardizedLocation(exifLocation.latitude, exifLocation.longitude)
          
          setCurrentLocation({
            name,
            lat: exifLocation.latitude,
            lng: exifLocation.longitude,
            displayName: name,
          })
          console.log('✅ Auto-populated location from photo:', name)
          setIsGettingLocation(false)
        }
      } catch (error) {
        console.log('Could not extract EXIF location:', error)
        setIsGettingLocation(false)
        // Non-critical error - just continue without auto-populating location
      }
    }
    reader.readAsDataURL(file)
  }

  const handleGetLocation = async () => {
    setIsGettingLocation(true)
    // setLocationErrorCount(0) // Reset error count on new attempt - this was part of the undone change

    try {
      const locationInfo = await getCurrentLocationWithName({ forceRefresh: true, useCache: false }) // User explicitly requested fresh location

      if (locationInfo) {
        setCurrentLocation({
          name: locationInfo.name, // This is the geocoded name (e.g., "City, State")
          lat: locationInfo.latitude,
          lng: locationInfo.longitude,
          displayName: locationInfo.name, // Use the geocoded name for display
        })
      } else {
        // This case handles if getCurrentLocationWithName returns null (e.g., geolocation not supported)
        // This path might not be hit if getCurrentLocationWithName always rejects on failure.
        setLocationErrorCount((prev: number) => prev + 1)
        toast.error("Location Unavailable", {
          description: "Could not retrieve location. Geolocation might not be supported or enabled.",
        })
      }
    } catch (error: any) {
      // Catch any unexpected errors from the utility or promise
      console.error("Error in handleGetLocation:", error)
      setLocationErrorCount((prev: number) => prev + 1)

      let errorMessage = "Location Error"
      let errorDescription = "Failed to get your location. You can still post without it."

      if (error && error.code !== undefined) {
        // Check if error is a GeolocationPositionError
        errorMessage = "Location Unavailable"
        switch (error.code) {
          case 0: // Custom code for "not supported"
            errorDescription = "Geolocation is not supported by your browser. You can still post without location."
            break
          case 1: // PERMISSION_DENIED
            errorDescription = "Location permission denied. You can still post without location."
            break
          case 2: // POSITION_UNAVAILABLE
            errorDescription = "Location information unavailable. You can still post without location."
            break
          case 3: // TIMEOUT
            errorDescription = "Location request timed out. You can still post without location."
            break
          default:
            errorDescription = `An unexpected error occurred (Code: ${error.code}). You can still post without location.`
        }
      } else if (error && error.message) {
        // Fallback for other types of errors
        errorDescription = `${error.message}. You can still post without location.`
      }

      if (locationErrorCount > 0) {
        // Changed from > 1 to > 0 to show on second attempt
        errorDescription += " This may be due to browser restrictions or network issues."
      }
      toast.error(errorMessage, {
        description: errorDescription,
      })
    } finally {
      setIsGettingLocation(false)
    }
  }

  const handleRemoveLocation = () => {
    setCurrentLocation(null)
    toast("Location removed", {
      description: "Location has been removed from the post",
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const isAnonymousSubmit = !user

    if (isAnonymousSubmit && reward < MIN_ANONYMOUS_REWARD) {
      toast.error("Minimum Reward Required", {
        description: `Anonymous posts require a minimum reward of ${MIN_ANONYMOUS_REWARD} sats.`,
      })
      setIsSubmitting(false)
      return
    }

    if (!image) {
      toast.error("Image required", {
        description: "Please take a photo of the issue",
      })
      setIsSubmitting(false)
      return
    }

    if (!description) {
      toast.error("Missing information", {
        description: "Please describe the issue",
      })
      setIsSubmitting(false)
      return
    }

    if (isAnonymousSubmit && !currentLocation) {
      toast.error("Location Required", {
        description: "Anonymous posts require a location. Please add your location before posting.",
      })
      setIsSubmitting(false)
      return
    }

    if (!isAnonymousSubmit && reward > 0 && (!user || !profile || profile.balance < reward)) {
      toast.error("Insufficient balance", {
        description: "You don't have enough sats to offer this reward",
      })
      router.push("/wallet")
      setIsSubmitting(false)
      return
    }

    // Handle anonymous submission
    if (isAnonymousSubmit) {
      try {
        const fundingInvoiceResult = await createPostFundingInvoiceAction(reward)

        if (fundingInvoiceResult.success && fundingInvoiceResult.paymentRequest && fundingInvoiceResult.rHash) {
          console.log("Setting funding modal state:", {
            paymentRequest: fundingInvoiceResult.paymentRequest,
            rHash: fundingInvoiceResult.rHash,
            paymentRequestLength: fundingInvoiceResult.paymentRequest.length,
          })
          setFundingPaymentRequest(fundingInvoiceResult.paymentRequest)
          setFundingRHash(fundingInvoiceResult.rHash)
          postCreationRef.current = false // Reset lock for new funding attempt
          setShowFundingModal(true)
          setIsAwaitingPayment(true)
          setIsSubmitting(false) // Reset submitting state
          return // Return early to prevent executing the registered user flow
        } else {
          toast.error("Error", {
            description: fundingInvoiceResult.error || "Could not create funding invoice. Please try again.",
          })
          setIsSubmitting(false)
          return
        }
      } catch (error) {
        console.error("Error creating funding invoice:", error)
        toast.error("Error", {
          description: "An unexpected error occurred while preparing your post.",
        })
        setIsSubmitting(false)
        return
      }
    }

    // This code only runs for registered users
    try {
      // SAFETY: Check caps before creating post
      const { checkPostSafetyCapsAction } = await import("@/app/actions/post-actions")
      const capsCheck = await checkPostSafetyCapsAction({
        userId: activeUserId || user!.id,
        reward,
      })
      
      if (!capsCheck.allowed) {
        toast.error("Post Limit Reached", {
          description: capsCheck.error || "Unable to create post at this time.",
        })
        setIsSubmitting(false)
        return
      }

      const now = new Date()
      const postId = uuidv4()

      // Upload image to storage if it's base64
      let finalImageUrl = image
      if (image && isBase64Image(image)) {
        console.log("📤 Uploading image to storage...")
        const imagePath = generateImagePath(activeUserId || user!.id, "posts")
        const { url, error: uploadError } = await uploadImage(image, imagePath)
        
        if (uploadError || !url) {
          console.error("Failed to upload image:", uploadError)
          toast.error("Upload Error", {
            description: "Failed to upload image. Please try again.",
          })
          setIsSubmitting(false)
          return
        }
        
        finalImageUrl = url
        console.log("✅ Image uploaded successfully")
      }

      const postDataForSupabase = {
        id: postId,
        user_id: activeUserId || user!.id,
        created_by: profile!.name,
        created_by_avatar: profile!.avatar_url,
        title: description.substring(0, 50),
        description,
        image_url: finalImageUrl,
        location: currentLocation?.name || null, // Use geocoded name
        latitude: currentLocation?.lat || null,
        longitude: currentLocation?.lng || null,
        reward,
        claimed: false,
        fixed: false,
        created_at: now.toISOString(),
        group_id: assignedTo ? null : selectedGroupId, // If assigned to person, no group
        assigned_to: assignedTo, // Individual assignment
        city: currentLocation?.displayName || currentLocation?.name || null, // Use displayName or fallback to name
        is_anonymous: false,
      }

      if (supabase) {
        const { error: insertError } = await supabase.from("posts").insert(postDataForSupabase)
        if (insertError) {
          console.error("Error saving post to Supabase:", insertError)
          throw insertError
        }
        
        // Only insert activity for posts WITHOUT rewards (server action will handle posts with rewards)
        if (reward === 0) {
          try {
            await supabase.from("activities").insert({
              id: uuidv4(),
              user_id: activeUserId || user!.id,
              type: "post",
              related_id: postId,
              related_table: "posts",
              timestamp: now.toISOString(),
              metadata: { title: description.substring(0, 50) },
            })
          } catch (activityError) {
            console.error("Error inserting activity for new post:", activityError)
          }
        }
      }

      // If post has a reward, create a transaction and update balance atomically
      // This also creates the activity with reward info
      if (profile && reward > 0) {
        const { createPostWithRewardAction } = await import("@/app/actions/post-actions")
        const result = await createPostWithRewardAction({
          postId,
          userId: activeUserId || user!.id,
          reward,
          memo: `Post reward for: ${description.substring(0, 50)}`
        })
        
        if (!result.success) {
          console.error("Error creating post reward transaction:", result.error)
          // Don't throw - post was already created, just log the error
        } else {
          // Refresh profile to get updated balance (action already updated it in DB)
          await refreshProfile()
        }
      }

      // Send email notification if assigned to a specific person
      if (assignedTo && assignedToProfile) {
        // Send job assigned email notification (fire and forget)
        fetch('/api/email/job-assigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postId,
            assignedToUserId: assignedTo,
            assignerUserId: activeUserId || user!.id,
            jobTitle: description.substring(0, 50),
            jobDescription: description,
            reward,
          })
        }).then(response => response.json())
          .then(result => {
            if (result.success) {
              console.log('[Email] Job assignment notification sent')
            } else {
              console.log('[Email] Skipped or failed:', result.message || result.error)
            }
          })
          .catch(error => {
            console.error('[Email] Error sending job assignment notification:', error)
          })
      }

      // Publish to Nostr asynchronously (only for public posts, not group posts)
      if (!selectedGroupId && !assignedTo) {
        fetch('/api/nostr/publish-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: description.substring(0, 50),
            description,
            location: currentLocation?.name,
            city: currentLocation?.displayName || currentLocation?.name,
            latitude: currentLocation?.lat,
            longitude: currentLocation?.lng,
            reward,
            postId,
            imageUrl: finalImageUrl
          })
        }).then(response => response.json())
          .then(result => {
            if (result.success) {
              console.log('[NOSTR] Post published to Nostr:', result.eventId)
            } else {
              console.error('[NOSTR] Failed to publish to Nostr:', result.error)
            }
          })
          .catch(error => {
            console.error('[NOSTR] Error publishing to Nostr:', error)
            // Don't fail the post creation if Nostr publishing fails
          })
        
        // Publish to Sphinx asynchronously (only for public posts, not group posts)
        fetch('/api/sphinx/publish-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: description.substring(0, 50),
            description,
            location: currentLocation?.name,
            city: currentLocation?.displayName || currentLocation?.name,
            latitude: currentLocation?.lat,
            longitude: currentLocation?.lng,
            reward,
            postId,
            imageUrl: finalImageUrl
          })
        }).then(response => response.json())
          .then(result => {
            if (result.success) {
              console.log('[SPHINX] Post published to Sphinx tribe')
            } else {
              console.error('[SPHINX] Failed to publish to Sphinx:', result.error)
            }
          })
          .catch(error => {
            console.error('[SPHINX] Error publishing to Sphinx:', error)
            // Don't fail the post creation if Sphinx publishing fails
          })
      } else {
        console.log('[NOSTR] Skipping Nostr publish for private post (group_id:', selectedGroupId, ', assigned_to:', assignedTo, ')')
        console.log('[SPHINX] Skipping Sphinx publish for private post (group_id:', selectedGroupId, ', assigned_to:', assignedTo, ')')
      }

      toast.success("🎉 Post created!", {
        description: "Your issue has been posted successfully ✅",
      })

      // Always redirect to dashboard, even if a group was selected
      router.push(`/dashboard?newPost=${postId}`)
    } catch (error) {
      console.error("Error creating post:", error)
      toast.error("Error", {
        description: "There was an error creating your post.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    if (step === "details") {
      setStep("photo")
      setCameraActive(true)
    } else {
      router.push("/dashboard")
    }
  }

  const navigateToWallet = () => {
    router.push("/wallet")
  }

  return (
    <div className={step === "photo" && cameraActive ? "" : "container px-4 py-6 mx-auto max-w-md"}>
      {step === "photo" && cameraActive && (
        <>
          <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-50">
            <div className="bg-black/50 text-white/70 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
              Take photo of the issue
            </div>
          </div>
          {/* Hidden file input that will be triggered by the icon in camera component */}
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </>
      )}

      {step === "photo" && cameraActive ? (
        <DynamicCameraCapture 
          key="camera-active"
          onCapture={handleCapture}
          onGalleryClick={() => document.getElementById('photo-upload')?.click()}
        />
      ) : (
        <>
          {!showCreateAccountPrompt && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {image && (
                <div className="relative w-full h-48 overflow-hidden rounded-lg">
                  <img src={image || "/placeholder.svg"} alt="Issue preview" className="object-cover w-full h-full" />
                  <Button
                    type="button"
                    size="icon"
                    className="absolute top-2 left-2 rounded-md bg-black/20 text-white hover:bg-black/40"
                    onClick={handleBack}
                  >
                    <ChevronLeft className="h-6 w-6" />
                    <span className="sr-only">Back</span>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    className="absolute top-2 right-2 rounded-md bg-black/20 text-white hover:bg-black/40"
                    onClick={() => router.push("/dashboard")}
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
                      className="h-6 w-6"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Close</span>
                  </Button>
                  
                  {/* Location Pill Overlay */}
                  <button
                    type="button"
                    onClick={() => setShowLocationModal(true)}
                    className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm text-white rounded-full text-sm font-medium hover:bg-black/70 transition-colors"
                  >
                    {currentLocation ? (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="max-w-[180px] truncate">
                          {(currentLocation.displayName || currentLocation.name).split(",")[0].trim()}
                        </span>
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="opacity-70"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="opacity-70">Add location</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <Textarea
                  ref={descriptionRef}
                  placeholder="Describe the issue..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur(); // Close keyboard
                    }
                  }}
                  onBlur={() => {
                    // After keyboard dismisses, highlight the group picker for logged-in users
                    if (!isAnonymous && description.trim()) {
                      setTimeout(() => {
                        setGroupPickerHighlighted(true)
                        // Remove highlight after a few seconds
                        setTimeout(() => setGroupPickerHighlighted(false), 3000)
                      }, 200)
                    }
                  }}
                  rows={2}
                  required
                  autoFocus
                  className="resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  enterKeyHint="done"
                />
              </div>

              {!isAnonymous && (
                  <div className="flex-1">
                    <Select
                      key={assignedTo || selectedGroupId || "public"} // Force re-render when assignment changes
                      value={assignedTo ? `person:${assignedTo}` : selectedGroupId || "public"}
                      onValueChange={(value: string) => {
                        setGroupPickerHighlighted(false) // Clear highlight when user interacts
                        if (value === "create-group") {
                          // Open the create group dialog instead of navigating away
                          setShowCreateGroupDialog(true)
                        } else if (value === "find-username") {
                          // Store current value before opening modal
                          previousSelectValueRef.current = assignedTo ? `person:${assignedTo}` : selectedGroupId || "public"
                          // Open modal - don't change assignment state
                          setShowUsernameSearch(true)
                          // The Select's value prop will stay at the current value (controlled component)
                          // When user selects from modal, state will update and Select will re-render
                        } else if (value.startsWith("person:")) {
                          const personId = value.replace("person:", "")
                          // Check both family members and assignedToProfile (for search results)
                          const person = familyMembers.find(m => m.id === personId) || 
                                       (assignedToProfile && assignedToProfile.id === personId ? assignedToProfile : null)
                          if (person) {
                            setAssignedTo(personId)
                            // Only update profile if not already set (from search modal)
                            if (!assignedToProfile || assignedToProfile.id !== personId) {
                              setAssignedToProfile(person)
                            }
                            setSelectedGroupId(null) // Clear group when assigning to person
                          }
                        } else if (value === "public") {
                          setSelectedGroupId(null)
                          setAssignedTo(null)
                          setAssignedToProfile(null)
                        } else {
                          setSelectedGroupId(value)
                          setAssignedTo(null) // Clear person when assigning to group
                          setAssignedToProfile(null)
                        }
                      }}
                    >
                      <SelectTrigger className={`w-full h-12 p-3 transition-all duration-300 ${groupPickerHighlighted ? 'ring-2 ring-green-500 border-green-500' : ''}`}>
                        <div className="flex items-center space-x-2 w-full">
                          <div className="flex-shrink-0">
                            {assignedTo ? (
                              <User className="w-4 h-4 text-purple-600" />
                            ) : selectedGroupId ? (
                              <Lock className="w-4 h-4 text-orange-600" />
                            ) : (
                              <Globe className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="font-medium text-base truncate">
                              {assignedTo && assignedToProfile
                                ? assignedToProfile.name || assignedToProfile.username
                                : selectedGroupId
                                ? userGroups.find((g: Group) => g.id === selectedGroupId)?.name || "Group"
                                : "Public"}
                            </div>
                          </div>
                        </div>
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value="public">
                          <div className="flex items-center space-x-3 py-1">
                            <Globe className="w-[18px] h-[18px] text-green-600" />
                            <div>
                              <div className="font-medium">Public</div>
                              <div className="text-xs text-muted-foreground">Anyone can see this job</div>
                            </div>
                          </div>
                        </SelectItem>
                        
                        {/* Groups Section */}
                        {userGroups.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                              Groups
                            </div>
                        {userGroups.map((g: Group) => (
                          <SelectItem key={g.id} value={g.id}>
                            <div className="flex items-center space-x-3 py-1">
                                  <Users className="w-[18px] h-[18px] text-orange-600" />
                              <div>
                                <div className="font-medium">{g.name}</div>
                                <div className="text-xs text-muted-foreground">
                                      Group members only
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                          </>
                        )}
                        
                        {/* Family Members Section */}
                        {familyMembers.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                              Family Members
                            </div>
                            {familyMembers.map((member) => (
                              <SelectItem key={member.id} value={`person:${member.id}`}>
                                <div className="flex items-center space-x-3 py-1">
                                  {member.avatar_url ? (
                                    <img 
                                      src={member.avatar_url} 
                                      alt={member.name || member.username}
                                      className="w-[18px] h-[18px] rounded-full object-cover"
                                    />
                                  ) : (
                                    <User className="w-[18px] h-[18px] text-purple-600" />
                                  )}
                                  <div>
                                    <div className="font-medium">{member.name || member.username}</div>
                                    <div className="text-xs text-muted-foreground">
                                      @{member.username} • Private
                                    </div>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        
                        {/* Show selected user from search if not in family members */}
                        {assignedTo && assignedToProfile && !familyMembers.find(m => m.id === assignedTo) && (
                          <>
                            {familyMembers.length > 0 && (
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                                Selected User
                              </div>
                            )}
                            <SelectItem value={`person:${assignedTo}`}>
                              <div className="flex items-center space-x-3 py-1">
                                {assignedToProfile.avatar_url ? (
                                  <img 
                                    src={assignedToProfile.avatar_url} 
                                    alt={assignedToProfile.name || assignedToProfile.username}
                                    className="w-[18px] h-[18px] rounded-full object-cover"
                                  />
                                ) : (
                                  <User className="w-[18px] h-[18px] text-purple-600" />
                                )}
                                <div>
                                  <div className="font-medium">{assignedToProfile.name || assignedToProfile.username}</div>
                                  <div className="text-xs text-muted-foreground">
                                    @{assignedToProfile.username} • Private
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          </>
                        )}
                        
                        {/* Separator and actions */}
                        <div className="border-t mt-1 pt-1">
                          <SelectItem value="find-username">
                            <div className="flex items-center space-x-3 py-1">
                              <Search className="w-[18px] h-[18px] text-blue-600" />
                              <div>
                                <div className="font-medium">Find by username</div>
                                <div className="text-xs text-muted-foreground">Assign to any user</div>
                              </div>
                            </div>
                          </SelectItem>
                        <SelectItem value="create-group">
                          <div className="flex items-center space-x-3 py-1">
                              <Users className="w-[18px] h-[18px] text-blue-600" />
                            <div>
                              <div className="font-medium">Create new group</div>
                              <div className="text-xs text-muted-foreground">Start a private group</div>
                            </div>
                          </div>
                        </SelectItem>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Username Search Modal */}
                {showUsernameSearch && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
                    <div className="bg-background w-full max-w-md rounded-t-xl sm:rounded-xl p-4 space-y-4 max-h-[80vh] overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Find by username</h3>
                        <button 
                          type="button"
                          onClick={() => {
                            setShowUsernameSearch(false)
                            setUsernameSearchQuery("")
                            setUsernameSearchResults([])
                          }}
                          className="p-2 hover:bg-muted rounded-full"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search username..."
                          value={usernameSearchQuery}
                          onChange={(e) => setUsernameSearchQuery(e.target.value)}
                          className="pl-10"
                          autoFocus
                        />
                      </div>
                      
                      <div className="flex-1 overflow-y-auto min-h-[200px]">
                        {isSearchingUsername ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                          </div>
                        ) : usernameSearchResults.length > 0 ? (
                          <div className="space-y-1">
                            {usernameSearchResults.map((result) => (
                              <button
                                key={result.id}
                                type="button"
                                onClick={() => {
                                  // Set state - this will update the Select's value prop to `person:${result.id}`
                                  // The key on the Select component will force a re-render with the new value
                                  setAssignedTo(result.id)
                                  setAssignedToProfile(result)
                                  setSelectedGroupId(null)
                                  // Close modal
                                  setShowUsernameSearch(false)
                                  setUsernameSearchQuery("")
                                  setUsernameSearchResults([])
                                  // Force a small delay to ensure state updates before Select re-renders
                                  // This ensures the Select component recognizes the new value
                                }}
                                className="w-full flex items-center space-x-3 p-3 hover:bg-muted rounded-lg transition-colors"
                              >
                                {result.avatar_url ? (
                                  <img 
                                    src={result.avatar_url} 
                                    alt={result.name || result.username}
                                    className="w-10 h-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                    <User className="w-5 h-5 text-purple-600" />
                                  </div>
                                )}
                                <div className="text-left">
                                  <div className="font-medium">{result.name || result.username}</div>
                                  <div className="text-sm text-muted-foreground">@{result.username}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : usernameSearchQuery.length >= 2 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No users found
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            Type at least 2 characters to search
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              <div className="space-y-6">
                <div className="flex flex-col items-center space-y-4 py-6">
                  <div className="flex items-center justify-between w-full max-w-xs">
                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault()
                        if (isAnonymous && reward <= MIN_ANONYMOUS_REWARD) {
                          toast.error("Minimum Reward Required", {
                            description: "Anonymous posts require a minimum reward of 500 sats.",
                          })
                          return
                        }
                        setReward((prev: number) => Math.max(isAnonymous ? MIN_ANONYMOUS_REWARD : 0, prev - 500))
                      }}
                      disabled={isAnonymous && reward <= MIN_ANONYMOUS_REWARD}
                      className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800"
                      title={
                        isAnonymous && reward <= MIN_ANONYMOUS_REWARD
                          ? "Anonymous posts require a minimum reward of 500 sats."
                          : ""
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-gray-600 dark:text-gray-300"
                      >
                        <path d="M5 12h14" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault()
                        setShowKeypad(!showKeypad)
                      }}
                      className="w-32 text-center hover:opacity-80 transition-opacity"
                    >
                      <span className="text-5xl font-light text-gray-900 dark:text-white">
                        {reward === 0 ? "0" : formatSatsValue(reward).replace(" sats", "").replace(".0", "")}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault()
                        setReward((prev: number) => Math.max(isAnonymous ? MIN_ANONYMOUS_REWARD : 0, prev + 500))
                      }}
                      className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-gray-600 dark:text-gray-300"
                      >
                        <path d="M12 5v14m-7-7h14" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center space-x-2 text-base text-gray-500 dark:text-gray-400">
                    <div className="w-5 h-5 relative">
                      <Image
                        src="/images/bitcoin-logo.png"
                        alt="Bitcoin"
                        width={20}
                        height={20}
                        className="object-contain"
                      />
                    </div>
                    <span>sats reward</span>
                  </div>

                  {/* Reserve space for USD conversion to prevent layout shift */}
                  <div className="h-6 flex items-center justify-center">
                    <p className={`text-sm text-gray-400 dark:text-gray-500 transition-opacity duration-300 ${bitcoinPrice && calculateUsdValue(reward) ? 'opacity-100' : 'opacity-0'}`}>
                      {bitcoinPrice && calculateUsdValue(reward) ? `$${calculateUsdValue(reward)} USD` : '$0.00 USD'}
                    </p>
                  </div>

                  {showKeypad && (
                    <div className="w-full max-w-xs">
                      <input
                        type="number"
                        value={reward || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          let newAmount = Number(e.target.value) || 0
                          if (isAnonymous) {
                            newAmount = Math.max(newAmount, MIN_ANONYMOUS_REWARD)
                          }
                          setReward(newAmount)
                        }}
                        placeholder="Enter amount"
                        className="w-full px-4 py-3 text-center text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        min="0"
                        max="50000"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full h-12 bg-green-600 hover:bg-green-700 text-white text-lg font-semibold" disabled={isSubmitting || isAwaitingPayment}>
                {isAwaitingPayment ? "Awaiting Payment..." : isSubmitting ? "Processing..." : "Post"}
              </Button>
            </form>
          )}
        </>
      )}

      {showFundingModal && fundingPaymentRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Fund Your Post</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              To publish your post, fund your {formatSatsValue(reward)} reward by paying the Lightning invoice.
            </p>
            <div className="mb-4">
              <div
                className="p-3 border rounded-md bg-gray-50 dark:bg-gray-700 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault()
                  setShowFullInvoice(!showFullInvoice)
                }}
              >
                <code className="break-all flex-1 mr-2">
                  {showFullInvoice
                    ? fundingPaymentRequest
                    : `${fundingPaymentRequest.slice(0, 20)}...${fundingPaymentRequest.slice(-20)}`}
                </code>
                <button
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(fundingPaymentRequest)
                    toast.success("Copied!", {
                      description: "Invoice copied to clipboard",
                    })
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded transition-colors flex-shrink-0"
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
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex justify-center my-4">
              {(() => {
                console.log("QRCode component rendering with:", {
                  fundingPaymentRequest,
                  length: fundingPaymentRequest?.length,
                  size: 200,
                })
                return <QRCode value={fundingPaymentRequest} size={200} />
              })()}
            </div>

            {isAwaitingPayment && (
              <div className="text-center my-4">
                <p className="text-blue-600 dark:text-blue-400 animate-pulse">Waiting for payment confirmation...</p>
                <p className="text-xs text-gray-500 mt-1">
                  Do not close this window. Your post will be created automatically after payment.
                </p>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
                setShowFundingModal(false)
                setIsAwaitingPayment(false)
                setFundingPaymentRequest(null)
                setFundingRHash(null)
                setIsSubmitting(false)
              }}
              disabled={isSubmitting && isAwaitingPayment}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showCreateAccountPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-lg shadow-2xl max-w-md w-full text-center">
            <div className="mb-6">
              <svg
                className="mx-auto h-12 w-12 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Post Created Successfully!</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Your post is live. Create an account to track your posts, earn bitcoin, and join community groups.
            </p>
            <div className="space-y-3">
              <Button
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault()
                  router.push(`/auth/register?redirect=/post/${lastCreatedPostId}`)
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Create Account
              </Button>
              <Button
                variant="secondary"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault()
                  setShowCreateAccountPrompt(false)
                  router.push(lastCreatedPostId ? `/map?selectedPost=${lastCreatedPostId}` : "/map")
                }}
                className="w-full"
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Location Editor Modal */}
      <LocationEditorModal
        isOpen={showLocationModal}
        onOpenChange={setShowLocationModal}
        currentLocation={currentLocation}
        onLocationChange={setCurrentLocation}
        onGetCurrentLocation={handleGetLocation}
        isGettingLocation={isGettingLocation}
      />

      {/* Create Group Dialog */}
      {!isAnonymous && (
        <CreateGroupDialog
          open={showCreateGroupDialog}
          onOpenChange={setShowCreateGroupDialog}
          userId={activeUserId || user!.id}
          onSuccess={(newGroup) => {
            // Store the created group
            setPendingGroup(newGroup)
            // Close the create dialog
            setShowCreateGroupDialog(false)
            // Open the share modal
            setShowShareGroupModal(true)
          }}
        />
      )}

      {/* Share Group Modal */}
      {!isAnonymous && pendingGroup && (
        <ShareGroupModal
          open={showShareGroupModal}
          onOpenChange={setShowShareGroupModal}
          group={pendingGroup}
          onDone={() => {
            // Auto-select the group in dropdown
            setSelectedGroupId(pendingGroup.id)
            // Add it to the userGroups list so it shows in the dropdown
            setUserGroups(prev => [...prev, pendingGroup])
            // Close the share modal
            setShowShareGroupModal(false)
            // Show success message
            toast.success("Group created!", {
              description: `${pendingGroup.name} has been created and selected for this post.`
            })
            // Clear pending group
            setPendingGroup(null)
          }}
        />
      )}
    </div>
  )
}
