const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testVoltageAPI() {
  console.log('⚡ Testing Voltage API...')
  
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3457'
    const response = await fetch(`${appUrl}/api/admin/node-balance`)
    
    if (!response.ok) {
      console.log(`❌ Voltage API: HTTP ${response.status}`)
      return { status: 'error', error: `HTTP ${response.status}` }
    }
    
    const nodeData = await response.json()
    
    if (!nodeData.success) {
      console.log(`❌ Voltage API: ${nodeData.error}`)
      return { status: 'error', error: nodeData.error }
    }
    
    const nodeBalance = nodeData.balances.total_balance
    console.log(`✅ Voltage API: Online`)
    console.log(`   Node Balance: ${nodeBalance.toLocaleString()} sats`)
    
    // Get app total balance for comparison
    const { data: profiles } = await supabase
      .from('profiles')
      .select('balance')
      .neq('status', 'deleted')
      
    const appTotalBalance = profiles?.reduce((sum, profile) => sum + profile.balance, 0) || 0
    const discrepancy = nodeBalance - appTotalBalance
    
    console.log(`   App Balance: ${appTotalBalance.toLocaleString()} sats`)
    console.log(`   Discrepancy: ${discrepancy.toLocaleString()} sats`)
    
    return { status: 'online', nodeBalance, discrepancy }
    
  } catch (error) {
    console.log(`❌ Voltage API: ${error.message}`)
    return { status: 'offline', error: error.message }
  }
}

async function testGroqAPI() {
  console.log('🤖 Testing Groq API...')
  
  try {
    if (!process.env.GROQ_API_KEY) {
      console.log('❌ Groq API: GROQ_API_KEY not configured')
      return { status: 'error', error: 'GROQ_API_KEY not configured' }
    }
    
    const { Groq } = require('groq-sdk')
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    })
    
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: "Hello, this is a health check. Please respond with 'OK'."
        }
      ],
      model: "llama-3.1-8b-instant",
      max_completion_tokens: 10,
      temperature: 0
    })
    
    const content = response.choices[0]?.message?.content || ""
    console.log(`✅ Groq API: Online`)
    console.log(`   Response: ${content}`)
    
    return { status: 'online' }
    
  } catch (error) {
    console.log(`❌ Groq API: ${error.message}`)
    return { status: 'offline', error: error.message }
  }
}

async function testResendAPI() {
  console.log('📧 Testing Resend API...')
  
  try {
    if (!process.env.RESEND_API_KEY) {
      console.log('❌ Resend API: RESEND_API_KEY not configured')
      return { status: 'error', error: 'RESEND_API_KEY not configured' }
    }
    
    const { Resend } = require('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    // Test with a simple domains list request
    const response = await resend.domains.list()
    
    console.log(`✅ Resend API: Online`)
    console.log(`   Domains count: ${response.data?.length || 0}`)
    
    return { status: 'online' }
    
  } catch (error) {
    console.log(`❌ Resend API: ${error.message}`)
    return { status: 'offline', error: error.message }
  }
}

async function testAPIHealth() {
  console.log('🧪 Testing API health checks...')
  console.log('')

  try {
    const [voltageResult, groqResult, resendResult] = await Promise.all([
      testVoltageAPI(),
      testGroqAPI(),
      testResendAPI()
    ])

    console.log('')
    console.log('📊 API HEALTH SUMMARY:')
    console.log('====================')
    console.log('')
    
    console.log('⚡ Voltage Lightning Node:')
    console.log(`   Status: ${voltageResult.status}`)
    if (voltageResult.nodeBalance) {
      console.log(`   Node Balance: ${voltageResult.nodeBalance.toLocaleString()} sats`)
      console.log(`   Discrepancy: ${voltageResult.discrepancy.toLocaleString()} sats`)
    }
    if (voltageResult.error) {
      console.log(`   Error: ${voltageResult.error}`)
    }
    console.log('')
    
    console.log('🤖 Groq AI API:')
    console.log(`   Status: ${groqResult.status}`)
    if (groqResult.error) {
      console.log(`   Error: ${groqResult.error}`)
    }
    console.log('')
    
    console.log('📧 Resend Email API:')
    console.log(`   Status: ${resendResult.status}`)
    if (resendResult.error) {
      console.log(`   Error: ${resendResult.error}`)
    }
    console.log('')

    console.log('📧 EMAIL PREVIEW:')
    console.log('================')
    console.log('')
    console.log('<h3>API Health Checks</h3>')
    console.log('')
    console.log('<h4>Voltage Lightning Node</h4>')
    if (voltageResult.status === 'online') {
      console.log('<p style="color: green; font-weight: bold;">✅ Voltage API: Online</p>')
      console.log('<ul>')
      console.log(`<li><strong>Node Balance:</strong> ${voltageResult.nodeBalance.toLocaleString()} sats</li>`)
      console.log(`<li><strong>Balance Discrepancy:</strong> ${voltageResult.discrepancy.toLocaleString()} sats</li>`)
      console.log('</ul>')
    } else {
      console.log(`<p style="color: red; font-weight: bold;">❌ Voltage API: ${voltageResult.status.toUpperCase()}</p>`)
      if (voltageResult.error) {
        console.log(`<p style="color: red;">Error: ${voltageResult.error}</p>`)
      }
    }
    console.log('')
    console.log('<h4>Groq AI API</h4>')
    if (groqResult.status === 'online') {
      console.log('<p style="color: green; font-weight: bold;">✅ Groq API: Online</p>')
    } else {
      console.log(`<p style="color: red; font-weight: bold;">❌ Groq API: ${groqResult.status.toUpperCase()}</p>`)
      if (groqResult.error) {
        console.log(`<p style="color: red;">Error: ${groqResult.error}</p>`)
      }
    }
    console.log('')
    console.log('<h4>Resend Email API</h4>')
    if (resendResult.status === 'online') {
      console.log('<p style="color: green; font-weight: bold;">✅ Resend API: Online</p>')
    } else {
      console.log(`<p style="color: red; font-weight: bold;">❌ Resend API: ${resendResult.status.toUpperCase()}</p>`)
      if (resendResult.error) {
        console.log(`<p style="color: red;">Error: ${resendResult.error}</p>`)
      }
    }

  } catch (error) {
    console.error('❌ Error testing API health:', error)
  }
}

testAPIHealth()
