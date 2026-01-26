"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowLeft, X, QrCode, Delete, User, Wallet, ChevronDown, CheckCircle2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { formatSatsValue } from "@/lib/utils"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"
import jsQR from "jsqr"
import { decodeLightningInvoice, truncateInvoice } from "@/lib/lightning-validation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function WithdrawPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, connectedAccounts, mainAccountProfile, activeUserId, loading: authLoading, refreshProfile } = useAuth()
  const [amount, setAmount] = useState("")
  const [recipient, setRecipient] = useState("")
  const [recipientType, setRecipientType] = useState<"lightning" | "username" | "">("")
  const [recipientProfile, setRecipientProfile] = useState<any>(null)
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPasteInput, setShowPasteInput] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  
  // Lightning invoice state - amount locked when invoice specifies it
  const [invoiceAmountLocked, setInvoiceAmountLocked] = useState(false)
  
  // Modal input state (separate from confirmed recipient)
  const [modalInputValue, setModalInputValue] = useState("")
  const [modalSelectedProfile, setModalSelectedProfile] = useState<{ id: string; username: string; name: string; avatar_url: string | null } | null>(null)
  
  // Modal input error state for validation
  const [modalInputError, setModalInputError] = useState<string | null>(null)
  const [isValidatingInvoice, setIsValidatingInvoice] = useState(false)
  
  // NWC wallet state - for paying from connected wallet
  type PaymentSource = "custodial" | "nwc"
  const [paymentSource, setPaymentSource] = useState<PaymentSource>("custodial")
  const [nwcWallet, setNwcWallet] = useState<{
    id: string
    name: string
    hasWallet: boolean
  } | null>(null)
  
  // Username typeahead state
  const [usernameSearchResults, setUsernameSearchResults] = useState<{ id: string; username: string; name: string; avatar_url: string | null }[]>([])
  const [isSearchingUsername, setIsSearchingUsername] = useState(false)
  const [hasSearchedUsername, setHasSearchedUsername] = useState(false)
  
  // Ref to track if we're auto-continuing (to prevent double execution)
  const autoContinueRef = useRef(false)
  
  // Ref for the main container to reset scroll position
  const mainContainerRef = useRef<HTMLDivElement>(null)
  
  const supabase = createBrowserSupabaseClient()

  // Bitcoin price state
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  const [isPriceLoading, setIsPriceLoading] = useState(false)
  const bitcoinPriceFetched = useRef(false)

  // Fetch the current Bitcoin price
  const fetchBitcoinPrice = useCallback(async () => {
    if (bitcoinPriceFetched.current) return

    try {
      setIsPriceLoading(true)
      const response = await fetch("/api/bitcoin-price")
      if (response.ok) {
        const data = await response.json()
        if (data.price && typeof data.price === "number") {
          setBitcoinPrice(data.price)
          bitcoinPriceFetched.current = true
        } else {
          console.warn("Bitcoin price API returned invalid price data")
          setBitcoinPrice(null)
        }
      } else {
        console.error("Failed to fetch Bitcoin price")
        setBitcoinPrice(null)
      }
    } catch (error) {
      console.error("Error fetching Bitcoin price:", error)
      setBitcoinPrice(null)
    } finally {
      setIsPriceLoading(false)
    }
  }, [])

  // Fetch Bitcoin price on mount
  useEffect(() => {
    fetchBitcoinPrice()
  }, [fetchBitcoinPrice])
  
  // Fetch NWC wallet status
  useEffect(() => {
    async function fetchNWCStatus() {
      try {
        const response = await fetch("/api/wallet/nwc/status")
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.hasNWCWallet && data.wallet) {
            setNwcWallet({
              id: data.wallet.id,
              name: data.wallet.name,
              hasWallet: true,
            })
            // Default to NWC if user has a connected wallet
            setPaymentSource("nwc")
          } else {
            setNwcWallet(null)
            setPaymentSource("custodial")
          }
        }
      } catch (error) {
        console.error("Failed to fetch NWC status:", error)
      }
    }
    
    if (user) {
      fetchNWCStatus()
    }
  }, [user])

  // Prefetch profile route for instant X button navigation
  useEffect(() => {
    router.prefetch("/profile")
  }, [router])

  // Calculate USD value
  const calculateUsdValue = (sats: number) => {
    if (!bitcoinPrice) return null
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPrice
    return usdValue.toFixed(2)
  }

  // Pre-populate recipient from URL params
  useEffect(() => {
    const recipientId = searchParams.get('recipient')
    if (recipientId) {
      // Check in connected accounts first
      let account = connectedAccounts.find(acc => acc.id === recipientId)
      
      // If not found and recipient is the main account (user.id), use mainAccountProfile
      if (!account && user && recipientId === user.id && mainAccountProfile) {
        account = mainAccountProfile
      }
      
      if (account) {
        setRecipient(account.username || account.id)
        setRecipientType("username")
        setRecipientProfile(account)
      }
    }
  }, [searchParams, connectedAccounts, mainAccountProfile, user])

  // Handle number pad input
  const handleNumberInput = (digit: string) => {
    if (amount === "0" && digit !== "0") {
      setAmount(digit)
    } else {
      setAmount(prev => prev + digit)
    }
  }

  // Handle backspace
  const handleBackspace = () => {
    setAmount(prev => prev.slice(0, -1) || "0")
  }

  // Fetch recipient profile by username
  const fetchRecipientProfile = async (username: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single()
      
      if (error || !data) {
        setRecipientProfile(null)
        return
      }
      
      setRecipientProfile(data)
    } catch (error) {
      console.error("Error fetching recipient profile:", error)
      setRecipientProfile(null)
    }
  }

  // Get all available recipient accounts (including main account if viewing from child)
  const getAvailableRecipients = () => {
    const recipients = [...connectedAccounts]
    
    // If viewing from child account, add main account to recipients
    if (activeUserId && user && mainAccountProfile) {
      recipients.unshift(mainAccountProfile) // Add main account at the beginning
    }
    
    return recipients
  }

  // Handle family member selection
  const handleFamilySelect = (account: any) => {
    setRecipient(account.username || account.id)
    setRecipientType("username")
    setRecipientProfile(account) // We already have the profile data
    setInvoiceAmountLocked(false) // Username transfers allow any amount
  }

  // Handle Lightning invoice - decode and set amount/memo
  const handleLightningInvoice = (invoice: string) => {
    const decoded = decodeLightningInvoice(invoice)
    
    setRecipient(invoice)
    setRecipientType("lightning")
    setRecipientProfile(null)
    
    // If invoice has a fixed amount, set it and lock the keypad
    if (decoded.amount !== null && decoded.amount > 0) {
      setAmount(decoded.amount.toString())
      setInvoiceAmountLocked(true)
    } else {
      // Any-amount invoice - user can enter amount
      setInvoiceAmountLocked(false)
    }
    
    // If invoice has a description, use it as the note
    if (decoded.description) {
      setNote(decoded.description)
    }
  }

  // Handle QR scan
  const handleQRScan = async (scannedData: string) => {
    // Check if it's a Lightning invoice
    if (scannedData.toLowerCase().startsWith('ln')) {
      handleLightningInvoice(scannedData)
      toast.success("Lightning Invoice Detected", {
        description: "Lightning invoice has been scanned successfully.",
      })
      setShowQRScanner(false)
      setShowPasteInput(false)
    } else {
      // Could be username or user ID (UUID)
      const cleanData = scannedData.startsWith('@') ? scannedData.substring(1) : scannedData
      
      // Check if it looks like a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const isUUID = uuidRegex.test(cleanData)
      
      // Search by user ID or username
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .eq(isUUID ? "id" : "username", cleanData)
        .single()
      
      if (error || !profile) {
        toast.error("User Not Found", {
          description: isUUID 
            ? "No user found with this account ID" 
            : `No user found with username @${cleanData}`,
        })
        setShowQRScanner(false)
        return
      }
      
      // Use username if available, otherwise use ID
      const recipientIdentifier = profile.username || profile.id
      setRecipient(recipientIdentifier)
      setRecipientType("username")
      setRecipientProfile(profile)
      setInvoiceAmountLocked(false) // Username transfers allow any amount
      toast.success("User Found", {
        description: `Ready to send to ${profile.name || profile.username || 'user'}`,
      })
      setShowQRScanner(false)
      setShowPasteInput(false)
    }
  }

  // Handle paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.toLowerCase().startsWith('ln')) {
        handleLightningInvoice(text)
        setShowPasteInput(false)
        toast.success("Invoice Pasted", {
          description: "Lightning invoice pasted successfully.",
        })
      } else {
        // Validate the username exists
        const username = text.startsWith('@') ? text.substring(1) : text
        
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, username, name, avatar_url")
          .eq("username", username)
          .single()
        
        if (error || !profile) {
          toast.error("User Not Found", {
            description: `No user found with username @${username}`,
          })
          return
        }
        
        setRecipient(profile.username)
        setRecipientType("username")
        setRecipientProfile(profile)
        setInvoiceAmountLocked(false) // Username transfers allow any amount
        setShowPasteInput(false)
        toast.success("User Found", {
          description: `Ready to send to @${username}`,
        })
      }
    } catch (error) {
      toast.error("Paste Failed", {
        description: "Could not paste from clipboard.",
      })
    }
  }

  // Check if user is authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("Authentication Required", {
        description: "Please sign in to access this feature",
      })
      router.push("/auth/login?redirect=/wallet/withdraw")
      return
    }
  }, [user, authLoading, router, toast])

  // Debounced username search - only triggers when NOT a lightning invoice
  useEffect(() => {
    // Clear selected profile when input changes (user is typing something new)
    setModalSelectedProfile(null)
    // Clear any previous error when input changes
    setModalInputError(null)
    
    const cleanQuery = modalInputValue.startsWith('@') ? modalInputValue.substring(1) : modalInputValue
    
    // Don't search if it looks like a lightning invoice (starts with ln)
    if (cleanQuery.toLowerCase().startsWith('ln')) {
      setUsernameSearchResults([])
      setHasSearchedUsername(false)
      return
    }
    
    // Need at least 2 characters to search
    if (cleanQuery.length < 2) {
      setUsernameSearchResults([])
      setHasSearchedUsername(false)
      return
    }

    const timeoutId = setTimeout(async () => {
      setIsSearchingUsername(true)
      
      // Check if it looks like a UUID (user might have pasted their user ID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const isUUID = uuidRegex.test(cleanQuery)
      
      let data, error
      
      if (isUUID) {
        // Search by user ID
        const result = await supabase
          .from('profiles')
          .select('id, username, name, avatar_url')
          .eq('id', cleanQuery)
          .limit(1)
        data = result.data
        error = result.error
      } else {
        // Search by username prefix
        const result = await supabase
          .from('profiles')
          .select('id, username, name, avatar_url')
          .ilike('username', `${cleanQuery}%`)
          .limit(5)
        data = result.data
        error = result.error
      }
      
      setIsSearchingUsername(false)
      setHasSearchedUsername(true)
      
      if (!error && data && data.length > 0) {
        setUsernameSearchResults(data)
      } else {
        setUsernameSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [modalInputValue, supabase])

  // Auto-continue when a valid lightning invoice is pasted and validate it
  useEffect(() => {
    const trimmedInput = modalInputValue.trim().toLowerCase()
    
    // Only proceed if it looks like a complete lightning invoice
    // Lightning invoices are typically 100+ characters
    if (!trimmedInput.startsWith('ln') || trimmedInput.length < 100 || autoContinueRef.current) {
      return
    }
    
    // Prevent double execution
    autoContinueRef.current = true
    
    const validateAndContinue = async () => {
      setIsValidatingInvoice(true)
      setModalInputError(null)
      
      try {
        // Validate the invoice via API
        const response = await fetch('/api/wallet/validate-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentRequest: modalInputValue.trim() })
        })
        
        const result = await response.json()
        
        if (!result.success) {
          setModalInputError(result.error || 'Invalid invoice')
          setIsValidatingInvoice(false)
          autoContinueRef.current = false
          return
        }
        
        // Invoice is valid - auto-continue
        handleLightningInvoice(modalInputValue.trim())
        setShowPasteInput(false)
        
        // Reset scroll position after modal closes
        setTimeout(() => {
          mainContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
          window.scrollTo({ top: 0, behavior: 'instant' })
        }, 50)
        
      } catch (error) {
        console.error('Error validating invoice:', error)
        setModalInputError('Failed to validate invoice')
        autoContinueRef.current = false
      } finally {
        setIsValidatingInvoice(false)
      }
    }
    
    validateAndContinue()
    
    // Reset the auto-continue flag when modal input changes
    return () => {
      autoContinueRef.current = false
    }
  }, [modalInputValue])

  // Process withdrawal or transfer
  const handleWithdrawal = async () => {
    if (!user || !profile) return

    const satsAmount = parseInt(amount)
    if (!satsAmount || satsAmount <= 0) {
      toast.error("Invalid Amount", {
        description: "Please enter a valid amount.",
      })
      return
    }

    // Only check custodial balance if paying from custodial wallet
    if (paymentSource === "custodial" && satsAmount > (profile.balance || 0)) {
      toast.error("Insufficient Balance", {
        description: "You don't have enough sats in your Ganamos wallet.",
      })
      return
    }

    setLoading(true)

    try {
      if (recipientType === "lightning") {
        // Handle Lightning invoice withdrawal
        const currentUserId = activeUserId || user.id
        
        // If using NWC wallet, call the NWC payment endpoint
        if (paymentSource === "nwc" && nwcWallet?.hasWallet) {
          const response = await fetch("/api/wallet/nwc/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ paymentRequest: recipient, amount: satsAmount }),
          })
          
          const result = await response.json()
          
          if (result.success) {
            toast.success("Payment Sent!", {
              description: `Successfully sent ${formatSatsValue(satsAmount)} sats from your connected wallet.`,
            })
            router.push("/wallet")
          } else {
            throw new Error(result.error || "Payment failed")
          }
        } else {
          // Custodial payment flow
          const response = await fetch("/api/wallet/withdraw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ paymentRequest: recipient, amount: satsAmount, userId: currentUserId }),
          })
          
          const result = await response.json()

          if (result.success) {
            await refreshProfile()
            toast.success("Bitcoin Sent!", {
              description: `Successfully sent ${formatSatsValue(satsAmount)} sats via Lightning.`,
            })
            router.push("/wallet")
          } else {
            throw new Error(result.error || "Lightning payment failed")
          }
        }
      } else if (recipientType === "username") {
        // Handle username-based transfer to any user via API route
        const currentUserId = activeUserId || user.id
        const response = await fetch('/api/wallet/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromUserId: currentUserId,
            toUsername: recipient,
            amount: satsAmount,
            memo: note || null
          })
        })

        const transferResult = await response.json()

        if (!response.ok || !transferResult.success) {
          throw new Error(transferResult.error || 'Transfer failed')
        }

        await refreshProfile()
        router.push("/wallet")
        
        // Show success toast after navigation
        setTimeout(() => {
          toast.success("Sats Sent!", {
            description: `Successfully sent ${formatSatsValue(satsAmount)} sats to ${transferResult.receiver_name ? transferResult.receiver_name.split(' ')[0] : `@${recipient}`}.`,
          })
        }, 100)
      }
    } catch (error: any) {
      console.error("Error processing transaction:", error)
      toast.error("Transaction Failed", {
        description: error.message || "Failed to process transaction.",
      })
    } finally {
      setLoading(false)
    }
  }

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="container max-w-md mx-auto py-8 px-4">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-2xl font-bold">Send Bitcoin</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner />
          <p className="mt-4 text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // If not authenticated, show login prompt
  if (!user) {
    return (
      <div className="container max-w-md mx-auto py-8 px-4">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-2xl font-bold">Send Bitcoin</h1>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-muted-foreground mb-6">Please sign in to withdraw funds</p>
              <Button onClick={() => router.push("/auth/login?redirect=/wallet/withdraw")}>Sign In</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" ref={mainContainerRef}>
      <div className="max-w-md mx-auto min-h-screen bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
        </Button>
          
          <h1 className="text-lg font-semibold">Send Bitcoin</h1>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/profile")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Recipient Info */}
          <div className="flex flex-col items-center space-y-2">
            {!recipient ? (
              /* Dotted Box for Recipient Selection */
              <button
                onClick={() => {
                  // Reset modal state when opening
                  setModalInputValue("")
                  setModalSelectedProfile(null)
                  setModalInputError(null)
                  setUsernameSearchResults([])
                  setHasSearchedUsername(false)
                  autoContinueRef.current = false
                  setShowPasteInput(true)
                }}
                className="relative w-20 h-20 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-8 w-8 text-gray-400 dark:text-gray-500 rotate-45" />
              </button>
            ) : (
              /* Selected Recipient Display */
              <div className="text-center">
                <button
                  onClick={() => {
                    // Prefill the modal with current recipient if it's a lightning invoice
                    if (recipientType === "lightning") {
                      setModalInputValue(recipient)
                      // Don't auto-continue since user is editing
                      autoContinueRef.current = true
                    } else {
                      setModalInputValue("")
                    }
                    setModalSelectedProfile(null)
                    setModalInputError(null)
                    setUsernameSearchResults([])
                    setHasSearchedUsername(false)
                    setShowPasteInput(true)
                  }}
                  className="flex flex-col items-center space-y-2 hover:opacity-80 transition-opacity"
                >
                  {recipientType === "username" && (
                    <div className="relative w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                      <Image
                        src={recipientProfile?.avatar_url || "/placeholder.svg?height=64&width=64"}
                        alt={recipientProfile?.name || recipient}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="text-lg font-semibold text-white">
                    {recipientType === "lightning" ? truncateInvoice(recipient) : `@${recipient}`}
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Amount Display */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center space-x-2 text-4xl font-light">
              <div className="w-6 h-6 relative">
                <Image
                  src="/images/bitcoin-logo.png"
                  alt="Bitcoin"
                  fill
                  className="object-contain"
                />
              </div>
              <span>{(parseInt(amount) || 0).toLocaleString()}</span>
              <span className="text-2xl text-gray-500">sats</span>
            </div>
            {!isPriceLoading && bitcoinPrice && calculateUsdValue(parseInt(amount) || 0) ? (
              <p className="text-sm text-gray-500">${calculateUsdValue(parseInt(amount) || 0)} USD</p>
            ) : (
              <p className="text-sm text-gray-500 opacity-0">$0.00 USD</p>
            )}
            {/* Only show insufficient balance for custodial payments */}
            {paymentSource === "custodial" && parseInt(amount) > (profile?.balance || 0) && (
              <p className="text-sm text-red-500">Insufficient Ganamos balance</p>
            )}
          </div>

          {/* Note Input */}
          <div className="px-4">
            <input
              type="text"
              placeholder="What's this for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-3 bg-transparent text-center text-gray-500 dark:text-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
            />
          </div>

          {/* Wallet Selector - Only show for Lightning payments when user has NWC wallet */}
          {recipientType === "lightning" && nwcWallet?.hasWallet && (
            <div className="px-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">
                        {paymentSource === "nwc" 
                          ? nwcWallet.name 
                          : "Ganamos Wallet"}
                      </span>
                      {paymentSource === "nwc" && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                          Connected
                        </span>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-[calc(100vw-3rem)] max-w-[368px]">
                  <DropdownMenuItem 
                    onClick={() => setPaymentSource("nwc")}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      <div>
                        <p className="font-medium">{nwcWallet.name}</p>
                        <p className="text-xs text-muted-foreground">Non-custodial wallet</p>
                      </div>
                    </div>
                    {paymentSource === "nwc" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setPaymentSource("custodial")}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={16} height={16} />
                      <div>
                        <p className="font-medium">Ganamos Wallet</p>
                        <p className="text-xs text-muted-foreground">
                          Balance: {formatSatsValue(profile?.balance || 0)}
                        </p>
                      </div>
                    </div>
                    {paymentSource === "custodial" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Send Button */}
          <div className="px-4">
            <Button
              onClick={handleWithdrawal}
              disabled={
                !recipient || 
                !amount || 
                amount === "0" || 
                loading || 
                (recipientType === "username" && !recipientProfile) ||
                (paymentSource === "custodial" && parseInt(amount) > (profile?.balance || 0))
              }
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white"
            >
              {loading 
                ? "Sending..." 
                : paymentSource === "nwc" && recipientType === "lightning"
                  ? "Pay from Wallet"
                  : "Send Sats"
              }
            </Button>
          </div>

          {/* Number Pad - Hidden when invoice amount is locked (fixed amount invoice) */}
          {!invoiceAmountLocked && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3 px-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant="outline"
                  className="h-16 sm:h-14 text-xl sm:text-lg"
                  onClick={() => recipient ? handleNumberInput(num.toString()) : undefined}
                  disabled={!recipient}
                >
                  {num}
                </Button>
              ))}
              <div></div>
              <Button
                variant="outline"
                className="h-16 sm:h-14 text-xl sm:text-lg"
                onClick={() => recipient ? handleNumberInput("0") : undefined}
                disabled={!recipient}
              >
                0
              </Button>
              <Button
                variant="outline"
                className="h-16 sm:h-14 text-xl sm:text-lg"
                onClick={() => recipient ? handleBackspace() : undefined}
                disabled={!recipient}
              >
                <Delete className="h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Simple Input Modal - No complex components */}
          {showPasteInput && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Send to</h3>
                    <button
                      onClick={() => {
                        setShowPasteInput(false)
                        // Reset scroll position after modal closes
                        setTimeout(() => {
                          mainContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
                          window.scrollTo({ top: 0, behavior: 'instant' })
                        }, 50)
                      }}
                      className="p-2 -m-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  
                  {/* Connected Accounts */}
                  {getAvailableRecipients().length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {getAvailableRecipients().map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            setRecipient(account.username || account.id)
                            setRecipientType("username")
                            setRecipientProfile(account)
                            setUsernameSearchResults([])
                            setHasSearchedUsername(false)
                            setShowPasteInput(false)
                            
                            // Reset scroll position after modal closes
                            setTimeout(() => {
                              mainContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
                              window.scrollTo({ top: 0, behavior: 'instant' })
                            }, 50)
                          }}
                          className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
                          title={`Send to ${account.name}`}
                        >
                          <Avatar className="h-12 w-12">
                            <AvatarImage
                              src={account.avatar_url ?? undefined}
                              alt={account.name || "Connected account"}
                            />
                            <AvatarFallback>
                              <User className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {account.name?.split(' ')[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-lpignore="true"
                        data-form-type="other"
                        data-1p-ignore="true"
                        inputMode="text"
                        name="lightning-input"
                        id="lightning-input"
                        placeholder="Lightning invoice or @username"
                        value={modalInputValue}
                        onChange={(e) => setModalInputValue(e.target.value)}
                        className={`w-full p-3 pr-12 border rounded-lg bg-white dark:bg-gray-800 ${
                          modalInputError 
                            ? 'border-red-500 dark:border-red-500' 
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowQRScanner(true)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Validation error display */}
                    {modalInputError && (
                      <p className="text-sm text-red-500 px-1">{modalInputError}</p>
                    )}
                    
                    {/* Validating indicator */}
                    {isValidatingInvoice && (
                      <p className="text-sm text-muted-foreground px-1">Validating invoice...</p>
                    )}
                    
                    {/* Username typeahead results */}
                    {modalInputValue.length >= 2 && !modalInputValue.toLowerCase().startsWith('ln') && (
                      <div className="space-y-1">
                        {isSearchingUsername ? (
                          <p className="text-sm text-muted-foreground px-1">Searching...</p>
                        ) : hasSearchedUsername && usernameSearchResults.length === 0 ? (
                          <p className="text-sm text-red-500 px-1">No matching users</p>
                        ) : usernameSearchResults.length > 0 ? (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {usernameSearchResults.map((result) => (
                              <button
                                key={result.id}
                                onClick={() => {
                                  // Select this user - update modal state only
                                  setModalInputValue(result.username)
                                  setModalSelectedProfile(result)
                                  setUsernameSearchResults([])
                                  setHasSearchedUsername(false)
                                }}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                                  modalSelectedProfile?.id === result.id
                                    ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500'
                                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <Avatar className="h-10 w-10">
                                  <AvatarImage
                                    src={result.avatar_url ?? undefined}
                                    alt={result.name || result.username}
                                  />
                                  <AvatarFallback>
                                    <User className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                  <p className="font-medium text-sm">{result.name}</p>
                                  <p className="text-xs text-muted-foreground">@{result.username}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    
                    {/* Show selected user when typeahead is closed */}
                    {modalSelectedProfile && usernameSearchResults.length === 0 && (
                      <div className="flex items-center gap-3 p-2 rounded-lg bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={modalSelectedProfile.avatar_url ?? undefined}
                            alt={modalSelectedProfile.name || modalSelectedProfile.username}
                          />
                          <AvatarFallback>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className="font-medium text-sm">{modalSelectedProfile.name}</p>
                          <p className="text-xs text-muted-foreground">@{modalSelectedProfile.username}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={async () => {
                      // Only proceed if we have a valid selection
                      if (modalInputValue.toLowerCase().startsWith('ln')) {
                        // Validate the invoice first
                        setIsValidatingInvoice(true)
                        setModalInputError(null)
                        
                        try {
                          const response = await fetch('/api/wallet/validate-invoice', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ paymentRequest: modalInputValue.trim() })
                          })
                          
                          const result = await response.json()
                          
                          if (!result.success) {
                            setModalInputError(result.error || 'Invalid invoice')
                            setIsValidatingInvoice(false)
                            return
                          }
                          
                          // Invoice is valid - proceed
                          handleLightningInvoice(modalInputValue.trim())
                          setShowPasteInput(false)
                          
                          // Reset scroll position after modal closes
                          setTimeout(() => {
                            mainContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
                            window.scrollTo({ top: 0, behavior: 'instant' })
                          }, 50)
                        } catch (error) {
                          console.error('Error validating invoice:', error)
                          setModalInputError('Failed to validate invoice')
                        } finally {
                          setIsValidatingInvoice(false)
                        }
                      } else if (modalSelectedProfile) {
                        // Valid username selected from typeahead
                        setRecipient(modalSelectedProfile.username)
                        setRecipientType("username")
                        setRecipientProfile(modalSelectedProfile)
                        setInvoiceAmountLocked(false) // Username transfers allow any amount
                        setShowPasteInput(false)
                        
                        // Reset scroll position after modal closes
                        setTimeout(() => {
                          mainContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
                          window.scrollTo({ top: 0, behavior: 'instant' })
                        }, 50)
                      }
                      // Clear modal state
                      setUsernameSearchResults([])
                      setHasSearchedUsername(false)
                    }}
                    disabled={(!modalInputValue.toLowerCase().startsWith('ln') && !modalSelectedProfile) || isValidatingInvoice}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isValidatingInvoice ? 'Validating...' : 'Continue'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* QR Scanner */}
          {showQRScanner && (
            <QRScannerCamera
              onScan={handleQRScan}
              onClose={() => setShowQRScanner(false)}
              cameraError={cameraError}
              setCameraError={setCameraError}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// QR Scanner Camera Component
function QRScannerCamera({ 
  onScan, 
  onClose, 
  cameraError, 
  setCameraError 
}: { 
  onScan: (data: string) => void
  onClose: () => void
  cameraError: string | null
  setCameraError: (error: string | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [])

  const startCamera = async () => {
    try {
      setCameraError(null)
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        startQRDetection()
      }
    } catch (err) {
      console.error("Camera error:", err)
      setCameraError("Unable to access camera. Please check permissions.")
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
  }

  const startQRDetection = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) return

    scanIntervalRef.current = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Use browser's built-in barcode detection if available
        if ('BarcodeDetector' in window) {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ['qr_code']
          })
          
          barcodeDetector.detect(canvas)
            .then((barcodes: any[]) => {
              if (barcodes.length > 0) {
                const qrData = barcodes[0].rawValue
                console.log('QR Code detected:', qrData)
                onScan(qrData)
                stopCamera()
              }
            })
            .catch((err: any) => {
              console.log('Barcode detection error:', err)
            })
        } else {
          // Fallback: Use jsQR library for browsers without BarcodeDetector
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          })
          
          if (code) {
            console.log('QR Code detected (jsQR):', code.data)
            onScan(code.data)
            stopCamera()
          }
        }
      }
    }, 500)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-black/50">
        <h2 className="text-white text-lg font-semibold">Scan QR Code</h2>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 p-2 rounded"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Camera View */}
      <div className="relative w-full h-full flex items-center justify-center">
        {cameraError ? (
          <div className="text-center text-white space-y-4">
            <QrCode className="h-16 w-16 mx-auto opacity-50" />
            <p className="text-lg">{cameraError}</p>
            <button 
              onClick={startCamera}
              className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              // @ts-ignore - webkit-playsinline is needed for iOS Safari
              webkit-playsinline=""
              muted
              style={{ transform: 'translateZ(0)' }}
            />
            
            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Scanning frame */}
                <div className="w-64 h-64 border-2 border-white rounded-lg relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>
                </div>
                
                <p className="text-white text-center mt-4 text-sm">
                  Position QR code within the frame
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hidden canvas for QR detection */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Bottom instructions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/50">
        <p className="text-white text-center text-sm">
          Scanning for QR code...
        </p>
      </div>
    </div>
  )
}

export default function WithdrawPage() {
  return (
    <Suspense fallback={
      <div className="container max-w-md mx-auto py-8 px-4">
        <div className="flex items-center mb-6">
          <Button variant="ghost" size="icon" disabled className="mr-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Send Bitcoin</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <WithdrawPageContent />
    </Suspense>
  )
}
