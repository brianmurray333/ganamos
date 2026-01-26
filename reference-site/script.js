// Ganamos L402 Job Posting Reference Implementation
const API_BASE_URL = 'http://localhost:3457'


let currentInvoice = null
let currentMacaroon = null
let paymentCheckInterval = null
let bitcoinPrice = null
let isPriceLoading = true

// State
const API_FEE = 10 // Fixed API fee in sats
let reward = 2000 // Job reward in sats (matches main app default)
let selectedLocation = null // Store selected location data

// Constants
const MIN_REWARD = 0
const REWARD_INCREMENT = 500 // Same as main app

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch Bitcoin price
    await fetchBitcoinPrice()
    
    // Set up event listeners
    setupEventListeners()
    
    // Update displays
    updateDisplays()
    
    // Load Google Maps for location autocomplete
    loadGoogleMaps()
})

// Fetch Bitcoin price
async function fetchBitcoinPrice() {
    console.log('Fetching Bitcoin price from:', `${API_BASE_URL}/api/bitcoin-price`)
    try {
        const response = await fetch(`${API_BASE_URL}/api/bitcoin-price`)
        console.log('Bitcoin price response status:', response.status)
        if (response.ok) {
            const data = await response.json()
            console.log('Bitcoin price data:', data)
            if (data.price && typeof data.price === 'number') {
                bitcoinPrice = data.price
                console.log('Bitcoin price set to:', bitcoinPrice)
            } else {
                console.log('Invalid price data received')
            }
        } else {
            console.log('Failed to fetch Bitcoin price, status:', response.status)
        }
    } catch (error) {
        console.warn('Failed to fetch Bitcoin price:', error)
    } finally {
        isPriceLoading = false
        console.log('Price loading finished, updating displays')
        updateDisplays()
    }
}

// Calculate USD value
function calculateUsdValue(sats) {
    if (!bitcoinPrice || isPriceLoading) return null
    const btcAmount = sats / 100000000
    const usdValue = btcAmount * bitcoinPrice
    return usdValue.toFixed(2)
}

// Convert file to base64 data URL
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = error => reject(error)
        reader.readAsDataURL(file)
    })
}


// Update all displays
function updateDisplays() {
    const totalCost = reward + API_FEE
    
    // Update reward display
    document.getElementById('rewardDisplay').textContent = reward.toLocaleString()
    
    // Update USD values
    const totalUsd = calculateUsdValue(totalCost)
    const rewardUsdEl = document.getElementById('rewardUsd')
    
    console.log('Bitcoin price:', bitcoinPrice, 'Total cost:', totalCost, 'USD value:', totalUsd) // Debug
    
    if (totalUsd && bitcoinPrice) {
        rewardUsdEl.textContent = `$${totalUsd} USD`
        rewardUsdEl.classList.remove('opacity-0')
        rewardUsdEl.classList.add('opacity-100')
    } else {
        rewardUsdEl.classList.add('opacity-0')
        rewardUsdEl.classList.remove('opacity-100')
    }
    
    // Update API preview
    updateApiPreview()
}

// Update API preview with current form data
function updateApiPreview() {
    const totalCost = reward + API_FEE
    const title = document.getElementById('title').value || 'Enter job title above'
    const description = document.getElementById('description').value || 'Enter job description above'
    const location = document.getElementById('location').value || 'Enter location above'
    
    // Update API preview JSON
    const apiPreview = document.getElementById('apiPreview')
    apiPreview.innerHTML = `<code>{\n  "title": "${title}",\n  "description": "${description}",\n  "location": "${location}",\n  "reward": ${reward}\n}</code>`
    
    // Update cost displays
    document.getElementById('apiTotalCost').textContent = `${totalCost.toLocaleString()} sats`
    document.getElementById('apiRewardAmount').textContent = reward.toLocaleString()
}

// Set up event listeners
function setupEventListeners() {
    // Reward controls (using same increments as main app)
    document.getElementById('decreaseReward').addEventListener('click', () => {
        reward = Math.max(MIN_REWARD, reward - REWARD_INCREMENT)
        updateDisplays()
    })
    
    document.getElementById('increaseReward').addEventListener('click', () => {
        reward = reward + REWARD_INCREMENT
        updateDisplays()
    })
    
    // Form input listeners for API preview
    const inputs = ['title', 'description', 'location']
    inputs.forEach(inputId => {
        const element = document.getElementById(inputId)
        if (element) {
            element.addEventListener('input', updateApiPreview)
        }
    })
    
    // Photo preview
    const imageInput = document.getElementById('image')
    if (imageInput) {
        imageInput.addEventListener('change', handleImagePreview)
    }
    
    // Remove photo button
    const removePhotoBtn = document.getElementById('removePhoto')
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', removePhoto)
    }
    
    // Location autocomplete
    const locationInput = document.getElementById('location')
    if (locationInput) {
        locationInput.addEventListener('input', handleLocationInput)
        locationInput.addEventListener('focus', () => {
            loadGoogleMaps() // Ensure Google Maps is loaded
        })
    }
}

// Form submission handler
document.getElementById('jobForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    
    const formData = new FormData(e.target)
    const jobData = {
        title: formData.get('title'),
        description: formData.get('description'),
        location: formData.get('location') || null,
        latitude: selectedLocation?.lat || null,
        longitude: selectedLocation?.lng || null,
        reward: reward
    }

    // Handle image upload
    const imageFile = formData.get('image')
    if (imageFile && imageFile.size > 0) {
        console.log('Converting uploaded image to base64...')
        try {
            // Convert image to base64 data URL
            const base64Image = await fileToBase64(imageFile)
            jobData.image_url = base64Image
            console.log('Image converted to base64, length:', base64Image.length)
        } catch (error) {
            console.error('Error converting image:', error)
            jobData.image_url = null
        }
    } else {
        console.log('No image uploaded')
        jobData.image_url = null
    }

    try {
        await createJobPosting(jobData)
    } catch (error) {
        console.error('Error creating job posting:', error)
        alert('Error creating job posting: ' + error.message)
    }
})

// Create job posting with L402 flow
async function createJobPosting(jobData) {
    try {
        // Step 1: Make initial request without L402 token
        const response = await fetch(`${API_BASE_URL}/api/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jobData)
        })

        if (response.status === 402) {
            // Step 2: Handle 402 Payment Required
            const paymentData = await response.json()
            const authHeader = response.headers.get('WWW-Authenticate')
            
            if (!authHeader) {
                throw new Error('No WWW-Authenticate header in 402 response')
            }

            // Parse the L402 challenge
            const challenge = parseL402Challenge(authHeader)
            currentInvoice = challenge.invoice
            currentMacaroon = challenge.macaroon

            // Show payment modal (QR code generator is always ready now)
            showPaymentModal(paymentData.payment_request, paymentData.total_amount, paymentData.job_reward, paymentData.api_fee)
            
            // Start checking for payment
            startPaymentCheck(jobData)
            
        } else if (response.ok) {
            // Job created successfully (shouldn't happen on first request)
            const result = await response.json()
            showSuccess(result.post_id)
        } else {
            // Other error
            const error = await response.json()
            throw new Error(error.error || 'Failed to create job posting')
        }
    } catch (error) {
        console.error('Error in createJobPosting:', error)
        throw error
    }
}

// Parse L402 challenge from WWW-Authenticate header
function parseL402Challenge(authHeader) {
    // Format: L402 macaroon="<base64>", invoice="<bolt11>"
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

// Show payment modal with QR code
function showPaymentModal(invoice, totalAmount, jobReward, apiFee) {
    const modal = document.getElementById('paymentModal')
    const qrContainer = document.getElementById('qrcode')
    const invoiceText = document.getElementById('invoiceText')
    const paymentAmount = document.getElementById('paymentAmount')
    const paymentAmountUsd = document.getElementById('paymentAmountUsd')
    
    // Update modal title
    const modalTitle = modal.querySelector('h3')
    modalTitle.textContent = `Pay ${totalAmount} sats to Post Job`
    
    // Update payment description
    const modalDescription = document.getElementById('paymentModalDescription')
    modalDescription.textContent = `Scan this QR code to pay ${totalAmount} sats (${jobReward} reward + ${apiFee} API fee)`
    
    // Clear previous QR code
    qrContainer.innerHTML = ''
    
    // Generate QR code (library is guaranteed to be loaded by now)
    console.log('Generating QR code for invoice:', invoice.substring(0, 20) + '...')
    
    try {
        QRCode.toCanvas(qrContainer, invoice, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        }, (error) => {
            if (error) {
                console.error('QR code generation error:', error)
                qrContainer.innerHTML = `<div class="text-red-500 p-4 border border-red-300 rounded">
                    <p class="text-sm">QR Code Error:</p>
                    <p class="text-xs">${error.message}</p>
                </div>`
            } else {
                console.log('QR code generated successfully')
            }
        })
    } catch (error) {
        console.error('QR code generation error:', error)
        qrContainer.innerHTML = `<div class="text-red-500 p-4 border border-red-300 rounded">
            <p class="text-sm">QR Generation Error:</p>
            <p class="text-xs">${error.message}</p>
        </div>`
    }
    
    // Show invoice text and amount
    invoiceText.textContent = invoice
    paymentAmount.textContent = totalAmount.toLocaleString()
    
    const usdValue = calculateUsdValue(totalAmount)
    if (usdValue) {
        paymentAmountUsd.textContent = `$${usdValue} USD`
    } else {
        paymentAmountUsd.textContent = 'USD price loading...'
    }
    
    // Show modal
    modal.classList.remove('hidden')
}

// Copy invoice text to clipboard
function copyInvoiceText() {
    const invoiceText = document.querySelector('.invoiceText')?.textContent
    if (invoiceText) {
        navigator.clipboard.writeText(invoiceText).then(() => {
            console.log('Invoice copied to clipboard')
        }).catch(err => {
            console.error('Failed to copy invoice:', err)
        })
    }
}

// Start checking for payment completion
function startPaymentCheck(jobData) {
    const paymentStatusEl = document.getElementById('paymentStatus')
    if (!paymentStatusEl) {
        console.error('Payment status element not found')
        return
    }
    
    paymentStatusEl.innerHTML = `
        <div class="text-center">
            <div class="animate-pulse">
                <div class="w-4 h-4 bg-blue-500 rounded-full mx-auto mb-2"></div>
                <p class="text-sm text-blue-600">Waiting for Lightning payment...</p>
            </div>
            <p class="text-xs text-gray-500 mt-2">
                Pay the invoice above with your Lightning wallet
            </p>
        </div>
    `
    
    // Check for payment every 2 seconds
    paymentCheckInterval = setInterval(async () => {
        try {
            await checkPaymentStatus(jobData)
        } catch (error) {
            console.error('Payment check error:', error)
        }
    }, 2000)
    
    // Stop checking after 10 minutes
    setTimeout(() => {
        if (paymentCheckInterval) {
            clearInterval(paymentCheckInterval)
            paymentCheckInterval = null
            document.getElementById('paymentStatus').innerHTML = `
                <div class="text-center text-red-600">
                    <p class="text-sm">Payment timeout</p>
                    <p class="text-xs">Please try again</p>
                </div>
            `
        }
    }, 600000) // 10 minutes
}

// Check if payment has been made
async function checkPaymentStatus(jobData) {
    if (!currentMacaroon || !currentInvoice) {
        console.error('Missing L402 credentials for payment check')
        return
    }

    try {
        // Extract payment hash from macaroon
        const macaroonData = JSON.parse(atob(currentMacaroon))
        const paymentHash = macaroonData.identifier
        
        console.log('Checking payment status for hash:', paymentHash)
        
        // Check invoice status using the new API endpoint
        const statusResponse = await fetch(`${API_BASE_URL}/api/invoice-status?r_hash=${paymentHash}`)
        
        if (!statusResponse.ok) {
            console.log('Could not check invoice status, status:', statusResponse.status)
            return
        }
        
        const statusData = await statusResponse.json()
        console.log('Invoice status:', statusData)
        
        if (statusData.success && statusData.settled) {
            console.log('Payment confirmed! Invoice has been paid.')
            console.log('Preimage available:', !!statusData.preimage)
            
            // Stop checking
            if (paymentCheckInterval) {
                clearInterval(paymentCheckInterval)
                paymentCheckInterval = null
            }
            
            if (statusData.preimage) {
                // We have the preimage! Complete the real L402 flow
                console.log('Preimage found, completing L402 authentication...')
                
                document.getElementById('paymentStatus').innerHTML = `
                    <div class="text-center text-green-600">
                        <p class="text-sm mb-2">✅ Payment Confirmed!</p>
                        <p class="text-xs">Completing L402 authentication...</p>
                    </div>
                `
                
                // Complete the job creation with real L402 token
                setTimeout(async () => {
                    await completeJobCreationWithPreimage(jobData, statusData.preimage)
                }, 1000)
                
            } else {
                // No preimage available, show partial success
                document.getElementById('paymentStatus').innerHTML = `
                    <div class="text-center text-orange-600">
                        <p class="text-sm mb-2">⚡ Payment Confirmed!</p>
                        <p class="text-xs">Preimage not available for L402 completion</p>
                    </div>
                `
                
                setTimeout(() => {
                    hidePaymentModal()
                    showDemoSuccess(paymentHash)
                }, 2000)
            }
        }
        
    } catch (error) {
        console.error('Error checking payment status:', error)
    }
}

// Complete job creation with real preimage
async function completeJobCreationWithPreimage(jobData, preimage) {
    if (!currentMacaroon) {
        throw new Error('Missing L402 macaroon')
    }

    try {
        console.log('Creating job with real L402 token...')
        
        // Create L402 authorization header with real preimage
        const l402Token = `${currentMacaroon}:${preimage}`
        
        const response = await fetch(`${API_BASE_URL}/api/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `L402 ${l402Token}`
            },
            body: JSON.stringify(jobData)
        })

        if (response.ok) {
            const result = await response.json()
            console.log('Job created successfully!', result)
            hidePaymentModal()
            showRealSuccess(result.post_id, result)
        } else {
            const error = await response.json()
            console.error('Failed to create job:', error)
            
            document.getElementById('paymentStatus').innerHTML = `
                <div class="text-center text-red-600">
                    <p class="text-sm mb-2">❌ Job Creation Failed</p>
                    <p class="text-xs">${error.error || 'Unknown error'}</p>
                </div>
            `
        }
    } catch (error) {
        console.error('Error completing job creation with preimage:', error)
        
        document.getElementById('paymentStatus').innerHTML = `
            <div class="text-center text-red-600">
                <p class="text-sm mb-2">❌ Error</p>
                <p class="text-xs">${error.message}</p>
            </div>
        `
    }
}

// Show real success when job is actually created
function showRealSuccess(postId, result) {
    document.getElementById('successModal').classList.remove('hidden')
    
    const successModal = document.getElementById('successModal')
    const content = successModal.querySelector('.text-center')
    content.innerHTML = `
        <div class="text-green-600 text-6xl mb-4">🎉</div>
        <h3 class="text-lg font-semibold mb-2">Job Posted Successfully!</h3>
        <p class="text-gray-600 mb-4">
            Your job posting has been created and is now live on Ganamos!
        </p>
        <div class="text-sm text-gray-500 mb-4 bg-gray-50 p-3 rounded">
            <strong>Post ID:</strong> ${postId}<br>
            <strong>Job Reward:</strong> ${result.job_reward} sats<br>
            <strong>API Fee:</strong> ${result.api_fee} sats<br>
            <strong>Total Paid:</strong> ${result.total_paid} sats
        </div>
        <div class="flex space-x-3">
            <button 
                onclick="location.reload()"
                class="flex-1 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors"
            >
                Create Another Job
            </button>
            <button 
                onclick="window.open('http://localhost:3457/post/${postId}', '_blank')"
                class="flex-1 bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors"
            >
                View Post
            </button>
        </div>
    `
}

// Show demo success (payment was confirmed but we can't complete L402 without preimage)
function showDemoSuccess(paymentHash) {
    document.getElementById('successModal').classList.remove('hidden')
    document.getElementById('postId').textContent = 'Payment Confirmed!'
    
    // Update success modal content
    const successModal = document.getElementById('successModal')
    const content = successModal.querySelector('.text-center')
    content.innerHTML = `
        <div class="text-green-600 text-6xl mb-4">⚡</div>
        <h3 class="text-lg font-semibold mb-2">Lightning Payment Confirmed!</h3>
        <p class="text-gray-600 mb-4">
            Your Lightning invoice has been paid successfully. The L402 protocol demonstration is complete!
        </p>
        <div class="text-sm text-gray-500 mb-6 bg-gray-50 p-3 rounded">
            <strong>Payment Hash:</strong><br>
            <span class="font-mono text-xs break-all">${paymentHash}</span>
        </div>
        <div class="text-xs text-blue-600 mb-4">
            <p class="mb-2"><strong>What happened:</strong></p>
            <ol class="text-left space-y-1">
                <li>1. ✅ L402 challenge issued (402 Payment Required)</li>
                <li>2. ✅ Lightning invoice generated</li>
                <li>3. ✅ Payment received and verified</li>
                <li>4. 🔄 Job creation requires preimage (next step)</li>
            </ol>
        </div>
        <button 
            id="closeSuccess"
            class="bg-green-600 text-white py-2 px-6 rounded hover:bg-green-700 transition-colors"
        >
            Try Another Job
        </button>
    `
}

// Hide payment modal
function hidePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden')
    if (paymentCheckInterval) {
        clearInterval(paymentCheckInterval)
        paymentCheckInterval = null
    }
}

// Show success modal
function showSuccess(postId) {
    document.getElementById('postId').textContent = postId
    document.getElementById('successModal').classList.remove('hidden')
}

// Event listeners for modal buttons
document.getElementById('copyInvoice').addEventListener('click', () => {
    const invoiceText = document.getElementById('invoiceText').textContent
    navigator.clipboard.writeText(invoiceText).then(() => {
        const btn = document.getElementById('copyInvoice')
        const originalText = btn.textContent
        btn.textContent = 'Copied!'
        setTimeout(() => {
            btn.textContent = originalText
        }, 2000)
    })
})

document.getElementById('cancelPayment').addEventListener('click', () => {
    hidePaymentModal()
    currentInvoice = null
    currentMacaroon = null
})

document.getElementById('closeSuccess').addEventListener('click', () => {
    document.getElementById('successModal').classList.add('hidden')
    document.getElementById('jobForm').reset()
    currentInvoice = null
    currentMacaroon = null
})

// Google Places API integration
let autocompleteService = null
let placesService = null

function loadGoogleMaps() {
    console.log('Loading Google Maps, current state:', !!window.google?.maps?.places)
    
    if (window.google?.maps?.places) {
        console.log('Google Maps already loaded, initializing services')
        initializeGoogleServices()
        return
    }
    
    // Load Google Maps via the API endpoint (same as main app)
    if (!document.getElementById('google-maps-script')) {
        console.log('Fetching Google Maps script from API')
        fetch('http://localhost:3457/api/maps')
            .then(response => {
                console.log('Maps API response:', response.status)
                return response.text()
            })
            .then(scriptContent => {
                console.log('Got script content, length:', scriptContent.length)
                const script = document.createElement('script')
                script.id = 'google-maps-script'
                script.text = scriptContent
                document.head.appendChild(script)
                
                // Wait for Google Maps to load
                let attempts = 0
                const checkInterval = setInterval(() => {
                    attempts++
                    console.log('Checking for Google Maps, attempt:', attempts, 'Available:', !!window.google?.maps?.places)
                    if (window.google?.maps?.places) {
                        clearInterval(checkInterval)
                        console.log('Google Maps loaded successfully!')
                        initializeGoogleServices()
                    }
                }, 100)
                
                setTimeout(() => {
                    clearInterval(checkInterval)
                    console.log('Google Maps loading timeout after 10 seconds')
                }, 10000)
            })
            .catch(error => {
                console.error('Failed to load Google Maps:', error)
            })
    } else {
        console.log('Google Maps script already exists in DOM')
    }
}

function initializeGoogleServices() {
    console.log('Initializing Google services, available:', !!window.google?.maps?.places)
    
    if (!window.google?.maps?.places) {
        console.log('Google Maps Places API not available')
        return
    }
    
    try {
        autocompleteService = new window.google.maps.places.AutocompleteService()
        const dummyMap = new window.google.maps.Map(document.createElement('div'))
        placesService = new window.google.maps.places.PlacesService(dummyMap)
        console.log('Google services initialized successfully')
    } catch (error) {
        console.error('Error initializing Google services:', error)
    }
}

function handleLocationInput(event) {
    const query = event.target.value
    const resultsDiv = document.getElementById('locationResults')
    
    console.log('Location input:', query, 'Autocomplete service:', !!autocompleteService) // Debug
    
    if (!query.trim()) {
        resultsDiv.classList.add('hidden')
        return
    }
    
    if (!autocompleteService) {
        console.log('Autocomplete service not ready, trying to load Google Maps')
        loadGoogleMaps()
        return
    }
    
    autocompleteService.getPlacePredictions({
        input: query,
        types: ['establishment', 'geocode']
    }, (predictions, status) => {
        console.log('Predictions:', predictions, 'Status:', status) // Debug
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            showLocationResults(predictions)
        } else {
            resultsDiv.classList.add('hidden')
        }
    })
}

function showLocationResults(predictions) {
    const resultsDiv = document.getElementById('locationResults')
    resultsDiv.innerHTML = ''
    
    predictions.slice(0, 5).forEach(prediction => {
        const div = document.createElement('div')
        div.className = 'p-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0'
        div.textContent = prediction.description
        div.addEventListener('click', () => selectLocation(prediction))
        resultsDiv.appendChild(div)
    })
    
    resultsDiv.classList.remove('hidden')
}

function selectLocation(prediction) {
    const locationInput = document.getElementById('location')
    const resultsDiv = document.getElementById('locationResults')
    
    locationInput.value = prediction.description
    resultsDiv.classList.add('hidden')
    
    // Get place details for coordinates
    if (placesService) {
        placesService.getDetails({
            placeId: prediction.place_id
        }, (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
                selectedLocation = {
                    name: prediction.description,
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                }
            }
        })
    }
    
    updateApiPreview()
}

// Image preview functionality
function handleImagePreview(event) {
    const file = event.target.files[0]
    const previewDiv = document.getElementById('imagePreview')
    const previewImg = document.getElementById('previewImg')
    const uploadBox = document.getElementById('photoUploadBox')
    
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
            previewImg.src = e.target.result
            previewDiv.classList.remove('hidden')
            uploadBox.classList.add('hidden') // Hide the upload box
        }
        reader.readAsDataURL(file)
    } else {
        previewDiv.classList.add('hidden')
        uploadBox.classList.remove('hidden') // Show the upload box
    }
}

// Remove photo functionality
function removePhoto() {
    const previewDiv = document.getElementById('imagePreview')
    const uploadBox = document.getElementById('photoUploadBox')
    const imageInput = document.getElementById('image')
    
    // Clear the file input
    imageInput.value = ''
    
    // Hide preview and show upload box
    previewDiv.classList.add('hidden')
    uploadBox.classList.remove('hidden')
}

// Hide location results when clicking outside
document.addEventListener('click', (event) => {
    const locationInput = document.getElementById('location')
    const resultsDiv = document.getElementById('locationResults')
    
    if (!locationInput.contains(event.target) && !resultsDiv.contains(event.target)) {
        resultsDiv.classList.add('hidden')
    }
})
