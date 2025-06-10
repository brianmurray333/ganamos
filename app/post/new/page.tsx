"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth-provider"
import { v4 as uuidv4 } from "@/lib/uuid"
import { formatSatsValue } from "@/lib/utils"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import type { Group } from "@/lib/types"
import {
  createPostFundingInvoiceAction,
  checkPostFundingStatusAction,
  createFundedAnonymousPostAction,
} from "@/app/actions/post-actions"
import QRCode from "@/components/qr-code"
import { getCurrentLocationWithName } from "@/lib/geocoding" // Import the geocoding utility

// Pre-load the camera component
import dynamic from "next/dynamic"
const DynamicCameraCapture = dynamic(() => import("@/components/camera-capture"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
      {/* Assuming you have a LoadingSpinner component */}
      {/* import LoadingSpinner from '@/components/loading-spinner'; */}
      {/* <LoadingSpinner message="Starting camera..." /> */}
      {/* Using a simple version if LoadingSpinner is not directly available here */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground mb-4 animate-spin"
      >
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </svg>
      <p className="text-sm text-muted-foreground">Starting camera...</p>
    </div>
  ),
})

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
  const { toast } = useToast()
  const router = useRouter()
  const { user, profile, updateBalance, activeUserId } = useAuth()
  const supabase = createBrowserSupabaseClient()
  const [showKeypad, setShowKeypad] = useState(false)
  const isAnonymous = !user
  const MIN_ANONYMOUS_REWARD = 500
  const [fundingPaymentRequest, setFundingPaymentRequest] = useState<string | null>(null)
  const [fundingRHash, setFundingRHash] = useState<string | null>(null)
  const [isAwaitingPayment, setIsAwaitingPayment] = useState(false)
  const [showFundingModal, setShowFundingModal] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false)
  const [lastCreatedPostId, setLastCreatedPostId] = useState<string | null>(null)
  const [locationErrorCount, setLocationErrorCount] = useState(0)
  const [showFullInvoice, setShowFullInvoice] = useState(false)

  useEffect(() => {
    if (isAnonymous) {
      setReward((prev) => Math.max(prev, MIN_ANONYMOUS_REWARD))
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

  // Fetch user's groups
  useEffect(() => {
    async function fetchUserGroups() {
      if (!user) return

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
          .eq("user_id", user.id)
          .eq("status", "approved")

        if (memberError) {
          console.error("Error fetching user groups:", memberError)
          throw memberError
        }

        // Transform the data to match the Group interface
        const transformedGroups = memberGroups
          .filter((item) => item.groups) // Filter out any null groups
          .map((item) => item.groups as Group)

        setUserGroups(transformedGroups)
      } catch (error) {
        console.error("Error in fetchUserGroups:", error)
        toast({
          title: "Error",
          description: "Failed to load your groups. You can still post without selecting a group.",
          variant: "destructive",
        })
      } finally {
        setLoadingGroups(false)
      }
    }

    fetchUserGroups()
  }, [user, supabase, toast])

  // Hide navigation bar
  useEffect(() => {
    // Hide the navigation bar when on details step
    const bottomNav = document.querySelector(".fixed.bottom-0.left-0.z-50.w-full.h-16") as HTMLElement
    if (bottomNav && step === "details") {
      bottomNav.style.display = "none"
    }

    return () => {
      // Show the navigation bar again when component unmounts
      const bottomNav = document.querySelector(".fixed.bottom-0.left-0.z-50.w-full.h-16") as HTMLElement
      if (bottomNav) {
        bottomNav.style.display = "grid"
      }
    }
  }, [step])

  // Polling for payment status
  useEffect(() => {
    if (isAwaitingPayment && fundingRHash) {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          console.log("Polling for payment status for rHash:", fundingRHash)
          const statusResult = await checkPostFundingStatusAction(fundingRHash)
          if (statusResult.success && statusResult.settled) {
            console.log("Payment confirmed for rHash:", fundingRHash)
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
            setIsAwaitingPayment(false)
            setShowFundingModal(false)
            toast({
              title: "Payment Confirmed!",
              description: "Your payment has been received. Creating your post...",
              variant: "success",
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
              toast({
                title: "🎉 Anonymous Post Created!",
                description: "Your issue has been posted successfully.",
                variant: "success",
                duration: 4000,
              })
              setShowCreateAccountPrompt(true)
            } else {
              toast({
                title: "Error Creating Post",
                description: creationResult.error || "Failed to create post after payment.",
                variant: "destructive",
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

  const handleCapture = (imageSrc: string) => {
    setImage(imageSrc)
    setStep("details")
  }

  const handleGetLocation = async () => {
    setIsGettingLocation(true)
    // setLocationErrorCount(0) // Reset error count on new attempt - this was part of the undone change

    try {
      const locationInfo = await getCurrentLocationWithName() // Use the imported utility

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
        setLocationErrorCount((prev) => prev + 1)
        toast({
          title: "Location Unavailable",
          description: "Could not retrieve location. Geolocation might not be supported or enabled.",
          variant: "destructive", // Changed to destructive for error
        })
      }
    } catch (error: any) {
      // Catch any unexpected errors from the utility or promise
      console.error("Error in handleGetLocation:", error)
      setLocationErrorCount((prev) => prev + 1)

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
      toast({
        title: errorMessage,
        description: errorDescription,
        variant: "destructive", // Changed to destructive
      })
    } finally {
      setIsGettingLocation(false)
    }
  }

  const handleRemoveLocation = () => {
    setCurrentLocation(null)
    toast({
      title: "Location removed",
      description: "Location has been removed from the post",
      variant: "default",
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const isAnonymousSubmit = !user

    if (isAnonymousSubmit && reward < MIN_ANONYMOUS_REWARD) {
      toast({
        title: "Minimum Reward Required",
        description: `Anonymous posts require a minimum reward of ${MIN_ANONYMOUS_REWARD} sats.`,
        variant: "destructive",
      })
      setIsSubmitting(false)
      return
    }

    if (!image) {
      toast({
        title: "Image required",
        description: "Please take a photo of the issue",
        variant: "destructive",
      })
      setIsSubmitting(false)
      return
    }

    if (!description) {
      toast({
        title: "Missing information",
        description: "Please describe the issue",
        variant: "destructive",
      })
      setIsSubmitting(false)
      return
    }

    if (isAnonymousSubmit && !currentLocation) {
      toast({
        title: "Location Required",
        description: "Anonymous posts require a location. Please add your location before posting.",
        variant: "destructive",
      })
      setIsSubmitting(false)
      return
    }

    if (!isAnonymousSubmit && reward > 0 && (!user || !profile || profile.balance < reward)) {
      toast({
        title: "Insufficient balance",
        description: "You don't have enough sats to offer this reward",
        variant: "destructive",
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
          setShowFundingModal(true)
          setIsAwaitingPayment(true)
          setIsSubmitting(false) // Reset submitting state
          return // Return early to prevent executing the registered user flow
        } else {
          toast({
            title: "Error",
            description: fundingInvoiceResult.error || "Could not create funding invoice. Please try again.",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
      } catch (error) {
        console.error("Error creating funding invoice:", error)
        toast({
          title: "Error",
          description: "An unexpected error occurred while preparing your post.",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }
    }

    // This code only runs for registered users
    try {
      const now = new Date()
      const postId = uuidv4()

      const postDataForSupabase = {
        id: postId,
        user_id: activeUserId || user!.id,
        created_by: profile!.name,
        created_by_avatar: profile!.avatar_url,
        title: description.substring(0, 50),
        description,
        image_url: image,
        location: currentLocation?.name || null, // Use geocoded name
        latitude: currentLocation?.lat || null,
        longitude: currentLocation?.lng || null,
        reward,
        claimed: false,
        fixed: false,
        created_at: now.toISOString(),
        group_id: selectedGroupId,
        city: currentLocation?.displayName || currentLocation?.name || null, // Use displayName or fallback to name
        is_anonymous: false,
      }

      if (supabase) {
        const { error: insertError } = await supabase.from("posts").insert(postDataForSupabase)
        if (insertError) {
          console.error("Error saving post to Supabase:", insertError)
          throw insertError
        }
      }

      if (profile && reward > 0) {
        updateBalance(profile.balance - reward)
      }

      const successToast = toast({
        title: "🎉 Post created!",
        description: "Your issue has been posted successfully ✅",
        variant: "success",
        duration: 3000,
      })
      setTimeout(() => successToast.dismiss(), 3000)

      if (selectedGroupId) {
        router.push(`/groups/${selectedGroupId}?newPost=${postId}`)
      } else {
        router.push(`/dashboard?newPost=${postId}`)
      }
    } catch (error) {
      console.error("Error creating post:", error)
      toast({
        title: "Error",
        description: "There was an error creating your post.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    if (step === "details") {
      setStep("photo")
    } else {
      router.push("/dashboard")
    }
  }

  const navigateToWallet = () => {
    router.push("/wallet")
  }

  return (
    <div className="container px-4 py-6 mx-auto max-w-md">
      {step === "photo" ? (
        <DynamicCameraCapture onCapture={handleCapture} onBack={handleBack} />
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
                    variant="secondary"
                    className="absolute top-2 right-2"
                    onClick={() => setStep("photo")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    <span className="sr-only">Retake photo</span>
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Textarea
                  placeholder="Describe the issue..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  required
                  className="resize-none"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg h-12">
                    {currentLocation ? (
                      <div className="flex items-center flex-1">
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
                          className="mr-1 text-green-600 flex-shrink-0"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-green-700 dark:text-green-400 block truncate">
                            {(currentLocation.displayName || currentLocation.name).split(",")[0].trim()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center flex-1">
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
                          className="mr-1 text-muted-foreground flex-shrink-0"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="text-xs text-muted-foreground">No location</span>
                      </div>
                    )}

                    {currentLocation ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveLocation}
                        className="text-xs h-6 px-2 ml-1 flex-shrink-0"
                      >
                        ×
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGetLocation}
                        className="text-xs h-6 px-2 flex-shrink-0"
                        disabled={isGettingLocation}
                      >
                        {isGettingLocation ? "..." : "Add"}
                      </Button>
                    )}
                  </div>
                </div>

                {!isAnonymous && !loadingGroups && (
                  <div className="flex-1">
                    {userGroups.length > 0 ? (
                      <Select
                        value={selectedGroupId || "public"}
                        onValueChange={(value) => setSelectedGroupId(value === "public" ? null : value)}
                      >
                        <SelectTrigger className="w-full h-12 p-3">
                          <div className="flex items-center space-x-2 w-full">
                            <div className="flex-shrink-0">
                              {selectedGroupId ? (
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
                                  className="text-orange-600"
                                >
                                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                  <path d="m7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                              ) : (
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
                                  className="text-green-600"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20" />
                                  <path d="M2 12h20" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <div className="font-medium text-xs truncate">
                                {selectedGroupId
                                  ? userGroups.find((g) => g.id === selectedGroupId)?.name || "Group"
                                  : "Public"}
                              </div>
                            </div>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">
                            <div className="flex items-center space-x-3 py-1">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-green-600"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20" />
                                <path d="M2 12h20" />
                              </svg>
                              <div>
                                <div className="font-medium">Public</div>
                                <div className="text-xs text-muted-foreground">Anyone can see this post</div>
                              </div>
                            </div>
                          </SelectItem>
                          {userGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              <div className="flex items-center space-x-3 py-1">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-orange-600"
                                >
                                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                  <path d="m7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <div>
                                  <div className="font-medium">{group.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Only group members can see this post
                                  </div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg h-12">
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
                          className="text-green-600 mr-2 flex-shrink-0"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20" />
                          <path d="M2 12h20" />
                        </svg>
                        <span className="text-xs font-medium">Public</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex flex-col items-center space-y-4 py-6">
                  <div className="flex items-center justify-between w-full max-w-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (isAnonymous && reward <= MIN_ANONYMOUS_REWARD) {
                          toast({
                            title: "Minimum Reward Required",
                            description: "Anonymous posts require a minimum reward of 500 sats.",
                            variant: "destructive",
                          })
                          return
                        }
                        setReward(Math.max(isAnonymous ? MIN_ANONYMOUS_REWARD : 0, reward - 500))
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
                      onClick={() => setShowKeypad(!showKeypad)}
                      className="w-32 text-center hover:opacity-80 transition-opacity"
                    >
                      <span className="text-5xl font-light text-gray-900 dark:text-white">
                        {reward === 0 ? "0" : formatSatsValue(reward).replace(" sats", "").replace(".0", "")}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReward(reward + 500)}
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

                  <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                    <div className="w-4 h-4 relative">
                      <Image
                        src="/images/bitcoin-logo.png"
                        alt="Bitcoin"
                        width={16}
                        height={16}
                        className="object-contain"
                      />
                    </div>
                    <span>sats reward</span>
                  </div>

                  {showKeypad && (
                    <div className="w-full max-w-xs">
                      <input
                        type="number"
                        value={reward}
                        onChange={(e) => {
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

              <Button type="submit" className="w-full" disabled={isSubmitting || isAwaitingPayment}>
                {isAwaitingPayment ? "Awaiting Payment..." : isSubmitting ? "Processing..." : "Post Issue"}
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
                onClick={() => setShowFullInvoice(!showFullInvoice)}
              >
                <code className="break-all flex-1 mr-2">
                  {showFullInvoice
                    ? fundingPaymentRequest
                    : `${fundingPaymentRequest.slice(0, 20)}...${fundingPaymentRequest.slice(-20)}`}
                </code>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(fundingPaymentRequest)
                    toast({
                      title: "Copied!",
                      description: "Invoice copied to clipboard",
                      variant: "success",
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
              onClick={() => {
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
                onClick={() => {
                  router.push(`/auth/register?redirect=/post/${lastCreatedPostId}`)
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Create Account
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
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
    </div>
  )
}
