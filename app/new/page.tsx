"use client"

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

// Global window type for Google Maps
declare global {
  interface Window {
    google?: any
  }
}

// State management
let bitcoinPrice: number | null = null
let isPriceLoading = true
const API_FEE = 10 // Fixed API fee in sats
let reward = 2000 // Job reward in sats (matches main app default)
let selectedLocation: { name: string; lat: number; lng: number } | null = null

// Constants
const MIN_REWARD = 0
const REWARD_INCREMENT = 500 // Same as main app
const API_BASE_URL = typeof window !== 'undefined' ? window.location.origin : ''

export default function NewJobPage() {
  const [mounted, setMounted] = useState(false)
  const [rewardAmount, setRewardAmount] = useState(2000)
  const [currentInvoice, setCurrentInvoice] = useState<string | null>(null)
  const [currentMacaroon, setCurrentMacaroon] = useState<string | null>(null)
  const [paymentCheckInterval, setPaymentCheckInterval] = useState<NodeJS.Timeout | null>(null)
  const paymentCheckRef = useRef<NodeJS.Timeout | null>(null)
  const jobCreationRef = useRef<boolean>(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [bitcoinPriceState, setBitcoinPriceState] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLocationState, setSelectedLocationState] = useState<{ name: string; lat: number; lng: number } | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<any>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<any[]>([])
  const [showLocationResults, setShowLocationResults] = useState(false)
  const [autocompleteService, setAutocompleteService] = useState<any>(null)
  const [copyButtonText, setCopyButtonText] = useState('Copy Invoice')
  const [invoiceTruncated, setInvoiceTruncated] = useState(true)
  const [jobCreationInProgress, setJobCreationInProgress] = useState(false)

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch Bitcoin price and initialize Google Maps on mount
  useEffect(() => {
    if (mounted) {
      fetchBitcoinPrice()
      loadGoogleMaps()
    }
  }, [mounted])

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval)
      }
    }
  }, [paymentCheckInterval])

  // Load Google Maps for location autocomplete
  const loadGoogleMaps = async () => {
    if (typeof window === 'undefined') return
    
    if (window.google?.maps?.places) {
      initializeGoogleServices()
      return
    }
    
    try {
      const response = await fetch('/api/maps')
      const scriptContent = await response.text()
      const script = document.createElement('script')
      script.text = scriptContent
      document.head.appendChild(script)
      
      // Wait for Google Maps to load
      const checkInterval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(checkInterval)
          initializeGoogleServices()
        }
      }, 100)
      
      setTimeout(() => clearInterval(checkInterval), 10000)
    } catch (error) {
      console.error('Failed to load Google Maps:', error)
    }
  }

  const initializeGoogleServices = () => {
    if (!window.google?.maps?.places) return
    
    try {
      const service = new window.google.maps.places.AutocompleteService()
      setAutocompleteService(service)
      console.log('Google Places autocomplete service initialized')
    } catch (error) {
      console.error('Error initializing Google services:', error)
    }
  }

  // Fetch Bitcoin price
  const fetchBitcoinPrice = async () => {
    try {
      const response = await fetch('/api/bitcoin-price')
      if (response.ok) {
        const data = await response.json()
        if (data.price && typeof data.price === 'number') {
          setBitcoinPriceState(data.price)
          bitcoinPrice = data.price
          console.log('Bitcoin price fetched successfully:', data.price)
        } else {
          console.warn('Bitcoin price API returned invalid data:', data)
        }
      } else {
        console.warn('Bitcoin price API returned error:', response.status)
        const errorData = await response.json().catch(() => ({}))
        console.warn('Bitcoin price API error details:', errorData)
      }
    } catch (error) {
      console.warn('Failed to fetch Bitcoin price:', error)
    } finally {
      isPriceLoading = false
    }
  }

  // Calculate USD value
  const calculateUsdValue = (sats: number) => {
    if (!bitcoinPriceState || isPriceLoading) return null
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPriceState
    return usdValue.toFixed(2)
  }

  // Handle reward adjustment
  const adjustReward = (delta: number) => {
    setRewardAmount(prev => Math.max(MIN_REWARD, prev + delta))
  }

  // Handle location input
  const handleLocationInput = (query: string) => {
    setLocationQuery(query)
    
    if (!query.trim() || !autocompleteService) {
      setLocationResults([])
      setShowLocationResults(false)
      return
    }
    
    autocompleteService.getPlacePredictions({
      input: query,
      types: ['establishment', 'geocode']
    }, (predictions: any, status: any) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
        setLocationResults(predictions.slice(0, 5))
        setShowLocationResults(true)
      } else {
        setLocationResults([])
        setShowLocationResults(false)
      }
    })
  }

  // Handle location selection
  const selectLocation = (prediction: any) => {
    setLocationQuery(prediction.description)
    setShowLocationResults(false)
    
    // Get place details for coordinates
    if (window.google?.maps?.places) {
      const service = new window.google.maps.places.PlacesService(document.createElement('div'))
      service.getDetails({
        placeId: prediction.place_id
      }, (place: any, status: any) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          setSelectedLocationState({
            name: prediction.description,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
          })
        }
      })
    }
  }

  // Handle image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Try to extract GPS location from EXIF data
      try {
        const { extractExifLocation } = await import('@/lib/exif')
        const exifLocation = await extractExifLocation(file)
        
        if (exifLocation) {
          console.log('📍 Found GPS in photo EXIF:', exifLocation)
          
          // Reverse geocode to get location name
          const response = await fetch(`${API_BASE_URL}/api/maps?lat=${exifLocation.latitude}&lng=${exifLocation.longitude}`)
          if (response.ok) {
            const data = await response.json()
            if (data.name) {
              // Auto-populate location with EXIF data
              selectedLocation = {
                name: data.name,
                lat: exifLocation.latitude,
                lng: exifLocation.longitude
              }
              setSelectedLocationState(selectedLocation)
              setLocationQuery(data.name)
              console.log('✅ Auto-populated location from photo:', data.name)
            }
          }
        }
      } catch (error) {
        console.log('Could not extract EXIF location:', error)
        // Non-critical error - just continue without auto-populating location
      }
    }
  }

  // Remove image
  const removeImage = () => {
    setImagePreview(null)
    const input = document.getElementById('image') as HTMLInputElement
    if (input) input.value = ''
  }

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
      reader.readAsDataURL(file)
    })
  }

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)

    const formData = new FormData(event.currentTarget)
    const jobData: any = {
      title: formData.get('title'),
      description: formData.get('description'),
      location: formData.get('location') || null,
      latitude: selectedLocationState?.lat || null,
      longitude: selectedLocationState?.lng || null,
      reward: rewardAmount
    }

    // Handle image upload - use the preview state instead of FormData
    console.log('Image preview state:', imagePreview ? 'PRESENT' : 'NULL')
    
    if (imagePreview) {
      console.log('Using image from preview state, length:', imagePreview.length)
      jobData.image_url = imagePreview
    } else {
      console.log('No image in preview state')
      jobData.image_url = null
    }
    
    console.log('Final jobData being sent:', { 
      ...jobData, 
      image_url: jobData.image_url ? `BASE64_DATA_${jobData.image_url.length}_CHARS` : null 
    })

    try {
      await createJobPosting(jobData)
    } catch (error) {
      console.error('Error creating job posting:', error)
      alert('Error creating job posting: ' + (error as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  // Create job posting with L402 flow
  const createJobPosting = async (jobData: any) => {
    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData)
      })

      if (response.status === 402) {
        // Handle 402 Payment Required
        console.log('Received 402 Payment Required response')
        const paymentData = await response.json()
        console.log('Payment data:', paymentData)
        
        const authHeader = response.headers.get('WWW-Authenticate')
        console.log('WWW-Authenticate header:', authHeader)
        
        if (!authHeader) {
          throw new Error('No WWW-Authenticate header in 402 response')
        }

        // Parse the L402 challenge
        const challenge = parseL402Challenge(authHeader)
        console.log('Parsed L402 challenge:', challenge)
        
        setCurrentInvoice(challenge.invoice)
        setCurrentMacaroon(challenge.macaroon)
        
        console.log('Set L402 credentials - Invoice:', !!challenge.invoice, 'Macaroon:', !!challenge.macaroon)

        // Show payment modal
        setCopyButtonText('Copy Invoice') // Reset copy button text
        setInvoiceTruncated(true) // Reset invoice display
        jobCreationRef.current = false // Reset job creation flag using ref
        setShowPaymentModal(true)
        
        // Start checking for payment with credentials directly
        console.log('Starting payment check...')
        startPaymentCheckWithCredentials(jobData, paymentData.total_amount, challenge.macaroon, challenge.invoice)
        
      } else if (response.ok) {
        const result = await response.json()
        showSuccess(result.post_id, result)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create job posting')
      }
    } catch (error) {
      console.error('Error in createJobPosting:', error)
      throw error
    }
  }

  // Parse L402 challenge from WWW-Authenticate header
  const parseL402Challenge = (authHeader: string) => {
    const macaroonMatch = authHeader.match(/macaroon="([^"]+)"/)
    const invoiceMatch = authHeader.match(/invoice="([^"]+)"/)
    
    if (!macaroonMatch || !invoiceMatch) {
      throw new Error('Invalid L402 challenge format')
    }

    return {
      macaroon: macaroonMatch[1],
      invoice: invoiceMatch[1]
    }
  }

  // Start checking for payment completion with credentials passed directly
  const startPaymentCheckWithCredentials = (jobData: any, totalAmount: number, macaroon: string, invoice: string) => {
    console.log('startPaymentCheckWithCredentials called with:', { 
      jobData, 
      totalAmount, 
      hasMacaroon: !!macaroon, 
      hasInvoice: !!invoice 
    })
    
    // Clear any existing interval first
    if (paymentCheckRef.current) {
      clearInterval(paymentCheckRef.current)
      paymentCheckRef.current = null
    }
    
    // Reset job creation flag
    jobCreationRef.current = false
    
    const checkInterval = setInterval(async () => {
      try {
        console.log('Payment check interval running with direct credentials...')
        await checkPaymentStatusWithCredentials(jobData, macaroon, invoice)
      } catch (error) {
        console.error('Payment check error:', error)
      }
    }, 2000)
    
    paymentCheckRef.current = checkInterval
    setPaymentCheckInterval(checkInterval)
    
    // Stop checking after 10 minutes
    setTimeout(() => {
      if (paymentCheckRef.current) {
        clearInterval(paymentCheckRef.current)
        paymentCheckRef.current = null
        setPaymentCheckInterval(null)
      }
    }, 600000)
  }

  // Check if payment has been made using passed credentials
  const checkPaymentStatusWithCredentials = async (jobData: any, macaroon: string, invoice: string) => {
    if (!macaroon || !invoice) {
      console.log('Missing L402 credentials for payment check')
      return
    }

    try {
      const macaroonData = JSON.parse(atob(macaroon))
      const paymentHash = macaroonData.identifier
      
      console.log('Checking payment status for hash:', paymentHash)
      
      const statusResponse = await fetch(`/api/invoice-status?r_hash=${paymentHash}`)
      
      console.log('Invoice status response:', statusResponse.status, statusResponse.ok)
      
      if (!statusResponse.ok) {
        console.log('Invoice status API not available or returned error')
        return
      }
      
      const statusData = await statusResponse.json()
      console.log('Invoice status data:', statusData)
      
      if (statusData.success && statusData.settled) {
        console.log('Payment confirmed! Preimage available:', !!statusData.preimage)
        
        // CRITICAL: Stop checking IMMEDIATELY using refs to prevent duplicates
        if (paymentCheckRef.current) {
          console.log('Clearing payment check interval to prevent duplicates')
          clearInterval(paymentCheckRef.current)
          paymentCheckRef.current = null
          setPaymentCheckInterval(null)
        }
        
        if (statusData.preimage && !jobCreationRef.current) {
          console.log('Completing job creation with preimage...')
          jobCreationRef.current = true // Prevent duplicate creation using ref
          
          // Complete job creation with real L402 token
          try {
            const l402Token = `${macaroon}:${statusData.preimage}`
            
            const response = await fetch('/api/posts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `L402 ${l402Token}`
              },
              body: JSON.stringify(jobData)
            })

            if (response.ok) {
              const result = await response.json()
              console.log('Job created successfully:', result)
              setShowPaymentModal(false)
              showSuccess(result.post_id, result)
            } else {
              const error = await response.json()
              console.error('Failed to create job:', error)
              jobCreationRef.current = false // Reset on error
            }
          } catch (error) {
            console.error('Error completing job creation:', error)
            jobCreationRef.current = false // Reset on error
          }
        } else if (jobCreationRef.current) {
          console.log('Job creation already in progress, skipping...')
        } else {
          console.log('No preimage available in response')
        }
        
        // Return early to prevent further processing
        return
      } else {
        console.log('Payment not yet settled, continuing to check...')
      }
    } catch (error) {
      console.error('Error checking payment status:', error)
    }
  }


  // Copy invoice to clipboard with feedback
  const copyInvoice = async () => {
    if (!currentInvoice) return
    
    try {
      await navigator.clipboard.writeText(currentInvoice)
      setCopyButtonText('✅ Copied!')
      
      // Reset button text after 2 seconds
      setTimeout(() => {
        setCopyButtonText('Copy Invoice')
      }, 2000)
    } catch (error) {
      console.error('Failed to copy invoice:', error)
      setCopyButtonText('❌ Copy Failed')
      
      // Reset button text after 2 seconds
      setTimeout(() => {
        setCopyButtonText('Copy Invoice')
      }, 2000)
    }
  }

  // Show success modal
  const showSuccess = (postId: string, result: any) => {
    setSuccessData({ postId, ...result })
    setShowSuccessModal(true)
  }

  const totalCost = rewardAmount + API_FEE
  const totalUsd = calculateUsdValue(totalCost)

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="relative min-h-screen">
        <div className="fixed inset-0 z-0">
          <Image
            src="/images/community-fixing.jpg"
            alt="Community background"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent" />
        </div>
        <div className="container mx-auto px-4 py-8 max-w-2xl relative z-10">
          <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg p-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Post a Job on Ganamos</h1>
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/community-fixing.jpg"
          alt="Community background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl relative z-10">
        <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg p-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Post a Job on Ganamos</h1>
          </div>

          {/* Job Creation Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo Upload */}
            <div>
              {!imagePreview ? (
                <div className="relative">
                  <input 
                    type="file" 
                    id="image" 
                    name="image"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-md text-center hover:border-green-400 transition-colors cursor-pointer">
                    <span className="text-gray-600">Add a Photo</span>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full max-w-xs h-48 object-cover rounded-md border"
                  />
                  <button 
                    type="button"
                    onClick={removeImage}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-black/70 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors shadow-md"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Job Title */}
            <div>
              <input 
                type="text" 
                id="title" 
                name="title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Add job title"
                required
              />
            </div>

            {/* Job Description */}
            <div>
              <textarea 
                id="description" 
                name="description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Describe the job"
                required
              />
            </div>

            {/* Location */}
            <div className="relative">
              <input 
                type="text" 
                id="location" 
                name="location"
                value={locationQuery}
                onChange={(e) => handleLocationInput(e.target.value)}
                onFocus={() => {
                  if (locationResults.length > 0) setShowLocationResults(true)
                  loadGoogleMaps() // Ensure Google Maps is loaded
                }}
                onBlur={() => {
                  // Delay hiding results to allow for clicks
                  setTimeout(() => setShowLocationResults(false), 150)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Add location"
                autoComplete="off"
              />
              
              {/* Location Results Dropdown */}
              {showLocationResults && locationResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto z-50 shadow-lg">
                  {locationResults.map((prediction, index) => (
                    <div
                      key={prediction.place_id || index}
                      onClick={() => selectLocation(prediction)}
                      className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 text-sm"
                    >
                      {prediction.description}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reward Picker */}
            <div>
              <div className="flex items-center justify-center space-x-4 mb-3">
                <button
                  type="button"
                  onClick={() => adjustReward(-REWARD_INCREMENT)}
                  className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                    <path d="M5 12h14" />
                  </svg>
                </button>

                <span className="text-3xl font-bold text-gray-900 min-w-[120px] text-center">
                  {rewardAmount.toLocaleString()}
                </span>

                <button
                  type="button"
                  onClick={() => adjustReward(REWARD_INCREMENT)}
                  className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                    <path d="M12 5v14m-7-7h14" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center space-x-2 text-sm text-gray-700 justify-center mb-2">
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

              <div className="text-center">
                <p className="text-xs text-gray-600 mb-1">+10 sat API fee</p>
                <div className="h-4 flex items-center justify-center">
                  <p className={`text-xs text-gray-500 transition-opacity duration-300 ${totalUsd ? 'opacity-100' : 'opacity-0'}`}>
                    {totalUsd ? `$${totalUsd} USD` : '$0.00 USD'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center mt-2">
                Amount to pay the person who completes this job
              </p>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors font-medium disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Job Posting'}
            </button>
          </form>
        </div>

        {/* API Documentation */}
        <div className="mt-8 bg-white/90 backdrop-blur rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">API Call Preview</h2>
          <div className="space-y-4 text-sm">
            <div>
              <strong>Endpoint:</strong> <code className="bg-gray-100 px-2 py-1 rounded">POST {API_BASE_URL}/api/posts</code>
            </div>
            <div>
              <strong>Authentication:</strong> L402 (Lightning HTTP 402 Protocol)
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <strong>Total Cost:</strong> <span className="font-mono bg-green-100 px-2 py-1 rounded">{totalCost.toLocaleString()} sats</span> 
              <span className="text-gray-600"> ({rewardAmount.toLocaleString()} reward + 10 API fee)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-6">Pay {totalCost} sats to Post Job</h3>
              
              <div className="flex justify-center mb-6">
                {currentInvoice && (
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentInvoice)}`}
                    alt="QR Code"
                    className="border rounded"
                    width={200}
                    height={200}
                  />
                )}
              </div>
              
              <div className="space-y-4">
                <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                  <div className="mb-2">
                    <strong>Amount:</strong> {totalCost.toLocaleString()} sats ({totalUsd && `$${totalUsd} USD`})
                  </div>
                  <div>
                    <strong>Invoice:</strong>
                    <div className="mt-1 font-mono text-xs cursor-pointer" onClick={() => setInvoiceTruncated(!invoiceTruncated)}>
                      {invoiceTruncated && currentInvoice ? 
                        `${currentInvoice.slice(0, 20)}...${currentInvoice.slice(-20)}` : 
                        currentInvoice
                      }
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <button 
                    onClick={copyInvoice}
                    className="flex-1 bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors"
                  >
                    {copyButtonText}
                  </button>
                  <button 
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              
              <div className="mt-6">
                <div className="text-sm text-gray-500">
                  <div className="animate-pulse">
                    <div className="w-4 h-4 bg-blue-500 rounded-full mx-auto mb-2"></div>
                    <p className="text-sm text-blue-600">Waiting for Lightning payment...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && successData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full text-center">
            <div className="text-green-600 text-6xl mb-4">🎉</div>
            <h3 className="text-lg font-semibold mb-2">Job Posted Successfully!</h3>
            <p className="text-gray-600 mb-4">
              Your job posting has been created and is now live on Ganamos!
            </p>
            <div className="text-sm text-gray-500 mb-6 bg-gray-50 p-3 rounded">
              <strong>Post ID:</strong> {successData.postId}<br/>
              <strong>Job Reward:</strong> {successData.job_reward} sats<br/>
              <strong>API Fee:</strong> {successData.api_fee} sats<br/>
              <strong>Total Paid:</strong> {successData.total_paid} sats
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={() => window.location.reload()}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors"
              >
                Create Another Job
              </button>
              <button 
                onClick={() => window.open(`/post/${successData.postId}`, '_blank')}
                className="flex-1 bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors"
              >
                View Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
