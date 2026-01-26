"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { User, Menu, X, Gift, Wallet, LogOut, UserCircle } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { formatSatsValue } from "@/lib/utils"
import { useDonationModal } from "@/components/donation-modal-provider"
import { loadGoogleMaps } from "@/lib/google-maps-loader"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

declare global {
  interface Window {
    google?: any
  }
}

export function DesktopHeader() {
  // ALL hooks must be called before any conditional returns (React rules)
  const pathname = usePathname()
  const router = useRouter()
  // NotificationsProvider removed - pending requests feature disabled
  const hasPendingRequests = false
  const donationModal = useDonationModal() // May be undefined if provider not available
  const { theme, setTheme } = useTheme()
  const { 
    user, 
    profile, 
    sessionLoaded,
    isConnectedAccount,
    connectedAccounts,
    activeUserId,
    switchToAccount,
    resetToMainAccount,
    mainAccountProfile,
  } = useAuth()
  
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showResults, setShowResults] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null)
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Initialize Google Maps Places services
  // IMPORTANT: All hooks must be called BEFORE any conditional returns
  useEffect(() => {
    const initializeGoogleServices = () => {
      if (!window.google?.maps?.places) {
        console.warn('Google Maps Places API not available')
        return
      }
      
      try {
        const autoService = new window.google.maps.places.AutocompleteService()
        // Create a dummy div for PlacesService (it needs a map but we'll handle that in search)
        const dummyDiv = document.createElement('div')
        const dummyMap = new window.google.maps.Map(dummyDiv)
        const placeService = new window.google.maps.places.PlacesService(dummyMap)
        setAutocompleteService(autoService)
        setPlacesService(placeService)
      } catch (error) {
        console.error('Error initializing Google Places services:', error)
      }
    }

    const loadGoogleMapsLocal = async () => {
      try {
        await loadGoogleMaps()
        initializeGoogleServices()
      } catch (error) {
        console.error('Error loading Google Maps:', error)
      }
    }

    loadGoogleMapsLocal()
  }, [])

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Now we can do conditional returns
  // Don't show header on home page, auth pages, or certain pages
  // Note: /post/[id] is allowed on desktop for side-by-side layout
  if (pathname === "/" || pathname.startsWith("/auth") || pathname === "/post/new" || pathname.startsWith("/wallet/withdraw") || pathname.startsWith("/wallet/deposit") || pathname === "/pet-settings" || pathname.startsWith("/satoshi-pet")) {
    return null
  }

  // Don't show for unauthenticated users
  if (sessionLoaded && !user) {
    return null
  }

  // Handle search input
  const handleSearchInput = (query: string) => {
    setSearchQuery(query)

    if (!query.trim() || !autocompleteService) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    autocompleteService.getPlacePredictions(
      {
        input: query,
        types: ["establishment", "geocode"],
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSearchResults(predictions)
          setShowResults(true)
        } else {
          setSearchResults([])
          setShowResults(false)
        }
      },
    )
  }

  // Handle place selection
  const handlePlaceSelect = (placeId: string, description: string) => {
    if (!placesService) return

    placesService.getDetails({ placeId }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
        setSearchQuery(description)
        setShowResults(false)
        // Could trigger map update here if needed
      }
    })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 hidden lg:block">
      <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Left side - Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <Image
            src="/favicon.png"
            alt="Ganamos"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="text-xl font-semibold text-gray-900 dark:text-white" style={{ fontFamily: 'Pacifico, cursive' }}>
            Ganamos
          </span>
        </Link>

        {/* Center - Search Bar */}
        {(pathname === "/dashboard" || pathname.startsWith("/post/")) && (
          <div ref={searchContainerRef} className="flex-1 max-w-md relative">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search location..."
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                className="w-full px-4 py-2 pr-10 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-md"
              />

              {/* Clear button */}
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("")
                    setSearchResults([])
                    setShowResults(false)
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                </button>
              )}

              {/* Search Results Dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto z-50">
                  {searchResults.map((result) => (
                    <button
                      key={result.place_id}
                      onClick={() => handlePlaceSelect(result.place_id, result.description)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm transition-colors"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{result.structured_formatting.main_text}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">{result.structured_formatting.secondary_text}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right side - Wallet & Profile */}
        <div className="flex items-center gap-3">
          {/* Wallet Button */}
          <Button
            variant="ghost"
            onClick={() => router.push("/wallet")}
            className="flex items-center gap-2 h-10 px-4 rounded-full bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 shadow-md"
          >
            <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={18} height={18} />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {profile ? formatSatsValue(profile.balance) : formatSatsValue(0)}
            </span>
          </Button>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="flex items-center gap-2 h-10 px-2 rounded-full border border-gray-300 dark:border-gray-600 shadow-md transition-shadow"
              >
                <Menu className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={profile?.avatar_url ?? undefined}
                      alt={profile?.name ?? "User"}
                    />
                    <AvatarFallback className="bg-gray-200 dark:bg-gray-700">
                      <User className="h-4 w-4 text-gray-500" />
                    </AvatarFallback>
                  </Avatar>
                  {hasPendingRequests && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2">
              {/* Menu Items */}
              <DropdownMenuItem onClick={() => router.push("/profile")} className="py-2.5 px-3 rounded-lg flex items-center gap-3">
                <UserCircle className="h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/wallet")} className="py-2.5 px-3 rounded-lg flex items-center gap-3">
                <Wallet className="h-4 w-4" />
                Wallet
              </DropdownMenuItem>

              {/* Account Switcher Section */}
              {connectedAccounts.length > 0 && (
                <>
                  <DropdownMenuSeparator className="my-2" />
                  <div className="px-3 py-1 mb-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Switch Account
                    </p>
                  </div>

                  <DropdownMenuItem
                    onClick={resetToMainAccount}
                    className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${!isConnectedAccount ? "bg-emerald-50 dark:bg-emerald-950" : ""}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage 
                        src={!isConnectedAccount ? profile?.avatar_url : mainAccountProfile?.avatar_url ?? undefined} 
                        alt={mainAccountProfile?.name ?? user?.user_metadata?.full_name ?? "User"} 
                      />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 font-medium">
                      {mainAccountProfile?.name || user?.user_metadata?.full_name || "Main Account"}{!isConnectedAccount && " (You)"}
                    </span>
                    {!isConnectedAccount && <span className="text-emerald-600">✓</span>}
                  </DropdownMenuItem>

                  {connectedAccounts.map((account: any) => (
                    <DropdownMenuItem
                      key={account.id}
                      onClick={() => switchToAccount(account.id)}
                      className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${activeUserId === account.id ? "bg-emerald-50 dark:bg-emerald-950" : ""}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={account.avatar_url ?? undefined} alt={account.name ?? undefined} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 font-medium">{account.name}</span>
                      {activeUserId === account.id && <span className="text-emerald-600">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator className="my-2" />
              
              {/* Theme Switcher */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault()
                  setTheme(theme === "dark" ? "light" : "dark")
                }}
                className="py-2.5 px-3 rounded-lg flex items-center gap-3"
              >
                {theme === "dark" ? (
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
                    className="text-yellow-300"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2" />
                    <path d="M12 20v2" />
                    <path d="m4.93 4.93 1.41 1.41" />
                    <path d="m17.66 17.66 1.41 1.41" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                    <path d="m6.34 17.66-1.41 1.41" />
                    <path d="m19.07 4.93-1.41 1.41" />
                  </svg>
                ) : (
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
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </DropdownMenuItem>

              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem onClick={() => router.push("/auth/logout")} className="py-2.5 px-3 rounded-lg text-red-600 dark:text-red-400 flex items-center gap-3">
                <LogOut className="h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

