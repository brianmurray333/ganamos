// Debug script to test invoice generation and see what Lightning node is actually being used
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌ MISSING')
  console.error('   SUPABASE_SECRET_API_KEY:', supabaseSecretKey ? '✅' : '❌ MISSING')
  console.error('\nPlease set these in your .env.local file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseSecretKey)

async function debugInvoiceGeneration() {
  console.log('🔍 Debugging Invoice Generation')
  console.log('='.repeat(60))
  
  const LND_REST_URL = process.env.LND_REST_URL
  const LND_ADMIN_MACAROON = process.env.LND_ADMIN_MACAROON
  
  console.log('📡 Lightning Configuration:')
  console.log(`  LND_REST_URL: ${LND_REST_URL}`)
  console.log(`  LND_ADMIN_MACAROON: ${LND_ADMIN_MACAROON ? 'Set (hidden)' : 'Missing'}`)
  console.log('')
  
  if (!LND_REST_URL || !LND_ADMIN_MACAROON) {
    console.log('❌ Lightning configuration missing!')
    return
  }
  
  // Test creating an invoice
  console.log('🧪 Testing Invoice Creation...')
  
  try {
    const baseUrl = LND_REST_URL.startsWith("http") ? LND_REST_URL : `https://${LND_REST_URL}`
    const url = `${baseUrl}/v1/invoices`
    
    console.log(`  Making request to: ${url}`)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Grpc-Metadata-macaroon': LND_ADMIN_MACAROON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        value: '1000',
        memo: 'Test invoice from debug script',
        expiry: '3600'
      })
    })
    
    console.log(`  Response status: ${response.status}`)
    console.log(`  Response headers:`, Object.fromEntries(response.headers.entries()))
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Invoice created successfully!')
      console.log('  Payment Request:', data.payment_request)
      console.log('  R-Hash:', data.r_hash_str)
      console.log('  Add Index:', data.add_index)
      console.log('')
      
      // Now check if this invoice appears in the Lightning node
      console.log('🔍 Checking invoice status...')
      const checkUrl = `${baseUrl}/v1/invoice/${data.r_hash_str}`
      console.log(`  Checking: ${checkUrl}`)
      
      const checkResponse = await fetch(checkUrl, {
        method: 'GET',
        headers: {
          'Grpc-Metadata-macaroon': LND_ADMIN_MACAROON,
          'Content-Type': 'application/json',
        }
      })
      
      if (checkResponse.ok) {
        const invoiceData = await checkResponse.json()
        console.log('✅ Invoice found in Lightning node!')
        console.log('  Invoice Status:', invoiceData.settled ? 'SETTLED' : 'OPEN')
        console.log('  Amount:', invoiceData.amt_paid_sat || '0')
        console.log('  State:', invoiceData.state)
      } else {
        console.log('❌ Invoice not found in Lightning node!')
        console.log(`  Status: ${checkResponse.status}`)
        const errorText = await checkResponse.text()
        console.log(`  Error: ${errorText}`)
      }
      
    } else {
      console.log('❌ Failed to create invoice!')
      const errorText = await response.text()
      console.log(`  Error: ${errorText}`)
    }
    
  } catch (error) {
    console.log('❌ Error creating invoice:', error.message)
  }
  
  console.log('')
  console.log('🔍 Key Questions:')
  console.log('1. Does the invoice creation succeed?')
  console.log('2. Does the invoice appear in your Voltage dashboard?')
  console.log('3. Are we connecting to the right Lightning node?')
  console.log('')
  console.log('💡 If the invoice is created but not visible in Voltage,')
  console.log('   then your app is connecting to a DIFFERENT Lightning node!')
}

debugInvoiceGeneration().catch(console.error)


