import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'
import { sendEmail } from './email'

let supabase: SupabaseClient<Database> | null = null

function getSupabaseClient() {
  if (!supabase) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured')
    }
    supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return supabase
}

async function checkVoltageAPI(): Promise<{
  status: 'online' | 'offline' | 'error'
  nodeBalance: number
  discrepancy: number
  error?: string
}> {
  console.log('[API HEALTH] Checking Voltage API...')
  
  try {
    // Get node balance from Voltage
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   (process.env.NODE_ENV === 'production' ? 'https://www.ganamos.earth' : 'http://localhost:3457')
    
    const response = await fetch(`${appUrl}/api/admin/node-balance`)
    
    if (!response.ok) {
      return {
        status: 'error',
        nodeBalance: 0,
        discrepancy: 0,
        error: `HTTP ${response.status}: ${response.statusText}`
      }
    }
    
    const nodeData = await response.json()
    
    if (!nodeData.success) {
      return {
        status: 'error',
        nodeBalance: 0,
        discrepancy: 0,
        error: nodeData.error || 'Unknown error'
      }
    }
    
    const nodeBalance = nodeData.balances.total_balance
    
    // Get app total balance for comparison
    const supabaseClient = getSupabaseClient()
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('balance')
      .neq('status', 'deleted')
      
    const appTotalBalance = profiles?.reduce((sum, profile) => sum + profile.balance, 0) || 0
    const discrepancy = nodeBalance - appTotalBalance
    
    console.log(`[API HEALTH] Voltage API: Online`)
    console.log(`[API HEALTH] Node Balance: ${nodeBalance.toLocaleString()} sats`)
    console.log(`[API HEALTH] App Balance: ${appTotalBalance.toLocaleString()} sats`)
    console.log(`[API HEALTH] Discrepancy: ${discrepancy.toLocaleString()} sats`)
    
    return {
      status: 'online',
      nodeBalance,
      discrepancy
    }
    
  } catch (error) {
    console.error('[API HEALTH] Voltage API error:', error)
    return {
      status: 'offline',
      nodeBalance: 0,
      discrepancy: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function checkGroqAPI(): Promise<{
  status: 'online' | 'offline' | 'error'
  error?: string
}> {
  console.log('[API HEALTH] Checking Groq API...')
  
  try {
    // Test Groq API with a simple request
    const { Groq } = await import('groq-sdk')
    
    if (!process.env.GROQ_API_KEY) {
      return {
        status: 'error',
        error: 'GROQ_API_KEY not configured'
      }
    }
    
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    })
    
    // Make a simple test request
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
    
    console.log(`[API HEALTH] Groq API: Online`)
    console.log(`[API HEALTH] Response: ${content}`)
    
    return {
      status: 'online'
    }
    
  } catch (error) {
    console.error('[API HEALTH] Groq API error:', error)
    return {
      status: 'offline',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function checkResendAPI(): Promise<{
  status: 'online' | 'offline' | 'error'
  error?: string
}> {
  console.log('[API HEALTH] Checking Resend API...')
  
  try {
    if (!process.env.RESEND_API_KEY) {
      return {
        status: 'error',
        error: 'RESEND_API_KEY not configured'
      }
    }
    
    // Test Resend API with a simple validation request
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    // Make a simple test request to validate the API key
    // We'll try to get the API key info or make a minimal request
    const response = await resend.domains.list()
    
    console.log(`[API HEALTH] Resend API: Online`)
    console.log(`[API HEALTH] Domains count: ${response.data?.length || 0}`)
    
    return {
      status: 'online'
    }
    
  } catch (error) {
    console.error('[API HEALTH] Resend API error:', error)
    return {
      status: 'offline',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function performBalanceAudit(): Promise<{
  status: 'passed' | 'failed'
  totalUsers: number
  usersWithDiscrepancies: number
  totalDiscrepancy: number
  discrepancies: Array<{
    email: string
    profileBalance: number
    calculatedBalance: number
    difference: number
  }>
}> {
  console.log('[BALANCE AUDIT] Starting balance audit...')
  const supabaseClient = getSupabaseClient()
  
  // Get all active profiles (exclude deleted accounts)
  const { data: profiles, error: profilesError } = await supabaseClient
    .from('profiles')
    .select('id, email, balance')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  if (profilesError) {
    console.error('[BALANCE AUDIT] Error fetching profiles:', profilesError)
    return {
      status: 'failed',
      totalUsers: 0,
      usersWithDiscrepancies: 0,
      totalDiscrepancy: 0,
      discrepancies: []
    }
  }

  const discrepancies: Array<{
    email: string
    profileBalance: number
    calculatedBalance: number
    difference: number
  }> = []

  let totalDiscrepancy = 0

  for (const profile of profiles || []) {
    // Calculate balance from transactions
    const { data: transactions, error: txError } = await supabaseClient
      .from('transactions')
      .select('amount, type')
      .eq('user_id', profile.id)
      .eq('status', 'completed')

    if (txError) {
      console.error(`[BALANCE AUDIT] Error fetching transactions for ${profile.email}:`, txError)
      continue
    }

    // Calculate balance from transactions
    const calculatedBalance = transactions?.reduce((sum, tx) => {
      if (tx.type === 'deposit') {
        return sum + tx.amount
      } else if (tx.type === 'withdrawal') {
        return sum - tx.amount
      } else if (tx.type === 'internal') {
        // Internal transactions can be positive (incoming) or negative (outgoing)
        // The amount already has the correct sign, so just add it
        return sum + tx.amount
      }
      return sum
    }, 0) || 0

    const difference = profile.balance - calculatedBalance

    if (difference !== 0) {
      discrepancies.push({
        email: profile.email,
        profileBalance: profile.balance,
        calculatedBalance: calculatedBalance,
        difference: difference
      })
      totalDiscrepancy += Math.abs(difference)
    }
  }

  const status = discrepancies.length === 0 ? 'passed' : 'failed'
  
  console.log(`[BALANCE AUDIT] Audit complete: ${status}`)
  console.log(`[BALANCE AUDIT] Total users: ${profiles?.length || 0}`)
  console.log(`[BALANCE AUDIT] Users with discrepancies: ${discrepancies.length}`)
  console.log(`[BALANCE AUDIT] Total discrepancy: ${totalDiscrepancy}`)

  return {
    status,
    totalUsers: profiles?.length || 0,
    usersWithDiscrepancies: discrepancies.length,
    totalDiscrepancy,
    discrepancies
  }
}

export interface DailySummaryData {
  nodeBalance: {
    channel_balance: number
    pending_balance: number
    onchain_balance: number
    total_balance: number
  }
  appTotalBalance: number
  balanceAudit: {
    status: 'passed' | 'failed'
    totalUsers: number
    usersWithDiscrepancies: number
    totalDiscrepancy: number
    discrepancies: Array<{
      email: string
      profileBalance: number
      calculatedBalance: number
      difference: number
    }>
  }
  apiHealth: {
    voltage: {
      status: 'online' | 'offline' | 'error'
      nodeBalance: number
      discrepancy: number
      error?: string
    }
    groq: {
      status: 'online' | 'offline' | 'error'
      error?: string
    }
    resend: {
      status: 'online' | 'offline' | 'error'
      error?: string
    }
  }
  last24Hours: {
    transactions: {
      count: number
    }
    deposits: {
      count: number
      amount: number
    }
    withdrawals: {
      count: number
      amount: number
    }
    rewards: {
      count: number
      amount: number
    }
    earnings: {
      count: number
      amount: number
    }
    activeUsers: number
  }
}

export async function getDailySummaryData(): Promise<DailySummaryData> {
  console.log('[DATA DEBUG] Starting getDailySummaryData function')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayIso = yesterday.toISOString()
  console.log('[DATA DEBUG] Yesterday ISO:', yesterdayIso)

  // Get node balance
  // In production, use the production domain; in development, use localhost
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
                 (process.env.NODE_ENV === 'production' ? 'https://www.ganamos.earth' : 'http://localhost:3457')
  console.log('[DATA DEBUG] App URL:', appUrl)
  console.log('[DATA DEBUG] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL)
  console.log('[DATA DEBUG] VERCEL_URL:', process.env.VERCEL_URL)
  console.log('[DATA DEBUG] About to fetch node balance from:', `${appUrl}/api/admin/node-balance`)
  
  let nodeBalanceData
  try {
    const nodeBalanceResponse = await fetch(`${appUrl}/api/admin/node-balance`)
    console.log('[DATA DEBUG] Node balance response status:', nodeBalanceResponse.status)
    console.log('[DATA DEBUG] Node balance response ok:', nodeBalanceResponse.ok)
    
    nodeBalanceData = nodeBalanceResponse.ok 
      ? await nodeBalanceResponse.json()
      : { balances: { channel_balance: 0, pending_balance: 0, onchain_balance: 0, total_balance: 0 } }
    
    console.log('[DATA DEBUG] Node balance data:', JSON.stringify(nodeBalanceData, null, 2))
  } catch (fetchError) {
    console.error('[DATA DEBUG] Error fetching node balance:', fetchError)
    nodeBalanceData = { balances: { channel_balance: 0, pending_balance: 0, onchain_balance: 0, total_balance: 0 } }
  }

  const supabaseClient = getSupabaseClient()
  
  // Get app total balance (sum of all user balances)
  const { data: profiles } = await supabaseClient
    .from('profiles')
    .select('balance')
    
  const appTotalBalance = profiles?.reduce((sum, profile) => sum + profile.balance, 0) || 0

  // Get transactions in last 24 hours
  const { data: transactions } = await supabaseClient
    .from('transactions')
    .select('type, amount, status')
    .gte('created_at', yesterdayIso)
    .eq('status', 'completed')

  const transactionsCount = transactions?.length || 0
  const deposits = transactions?.filter(t => t.type === 'deposit') || []
  const withdrawals = transactions?.filter(t => t.type === 'withdrawal') || []

  // Get posts created in last 24 hours (rewards)
  const { data: createdPosts } = await supabaseClient
    .from('posts')
    .select('reward')
    .gte('created_at', yesterdayIso)

  const rewardsCount = createdPosts?.length || 0
  const rewardsAmount = createdPosts?.reduce((sum, post) => sum + post.reward, 0) || 0

  // Get posts completed in last 24 hours (earnings)
  const { data: completedPosts } = await supabaseClient
    .from('posts')
    .select('reward')
    .gte('fixed_at', yesterdayIso)
    .eq('fixed', true)

  const earningsCount = completedPosts?.length || 0
  const earningsAmount = completedPosts?.reduce((sum, post) => sum + post.reward, 0) || 0

  // Get active users (users who had any transaction, created post, or fixed post in last 24 hours)
  const { data: activeUserIds } = await supabaseClient
    .rpc('get_active_users_last_24h', { since_timestamp: yesterdayIso })

  const activeUsers = activeUserIds?.length || 0

  // Perform balance audit
  const balanceAudit = await performBalanceAudit()

  // Check API health
  const [voltageHealth, groqHealth, resendHealth] = await Promise.all([
    checkVoltageAPI(),
    checkGroqAPI(),
    checkResendAPI()
  ])

  return {
    nodeBalance: nodeBalanceData.balances,
    appTotalBalance,
    balanceAudit,
    apiHealth: {
      voltage: voltageHealth,
      groq: groqHealth,
      resend: resendHealth
    },
    last24Hours: {
      transactions: {
        count: transactionsCount
      },
      deposits: {
        count: deposits.length,
        amount: deposits.reduce((sum, d) => sum + d.amount, 0)
      },
      withdrawals: {
        count: withdrawals.length,
        amount: withdrawals.reduce((sum, w) => sum + w.amount, 0)
      },
      rewards: {
        count: rewardsCount,
        amount: rewardsAmount
      },
      earnings: {
        count: earningsCount,
        amount: earningsAmount
      },
      activeUsers
    }
  }
}

export function generateEmailHTML(data: DailySummaryData): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
    <h2>Ganamos Daily Summary - ${date}</h2>
    
    <h3>Node & App Balances</h3>
    <ul>
      <li><strong>Node Balance:</strong> ${data.nodeBalance.total_balance.toLocaleString()} sats</li>
      <li><strong>App Total Balance:</strong> ${data.appTotalBalance.toLocaleString()} sats</li>
      <li><strong>Difference (Audit):</strong> ${(data.nodeBalance.total_balance - data.appTotalBalance).toLocaleString()} sats</li>
    </ul>

    <h3>Last 24 Hours Activity</h3>
    
    <h4>Transactions</h4>
    <ul>
      <li><strong>Total Transactions:</strong> ${data.last24Hours.transactions.count}</li>
      <li><strong>Deposits:</strong> ${data.last24Hours.deposits.count} (${data.last24Hours.deposits.amount.toLocaleString()} sats)</li>
      <li><strong>Withdrawals:</strong> ${data.last24Hours.withdrawals.count} (${data.last24Hours.withdrawals.amount.toLocaleString()} sats)</li>
    </ul>

    <h4>Posts & Rewards</h4>
    <ul>
      <li><strong>New Posts Created:</strong> ${data.last24Hours.rewards.count} (${data.last24Hours.rewards.amount.toLocaleString()} sats in rewards)</li>
      <li><strong>Posts Completed:</strong> ${data.last24Hours.earnings.count} (${data.last24Hours.earnings.amount.toLocaleString()} sats earned)</li>
    </ul>

    <h4>User Activity</h4>
    <ul>
      <li><strong>Active Users:</strong> ${data.last24Hours.activeUsers}</li>
    </ul>

    <h3>Balance Audit</h3>
    ${data.balanceAudit.status === 'passed' 
      ? '<p style="color: green; font-weight: bold;">✅ Balance audit check confirmed</p>'
      : `
        <p style="color: red; font-weight: bold;">⚠️ Balance discrepancies detected!</p>
        <ul>
          <li><strong>Total Users:</strong> ${data.balanceAudit.totalUsers}</li>
          <li><strong>Users with Discrepancies:</strong> ${data.balanceAudit.usersWithDiscrepancies}</li>
          <li><strong>Total Discrepancy:</strong> ${data.balanceAudit.totalDiscrepancy.toLocaleString()} sats</li>
        </ul>
        ${data.balanceAudit.discrepancies.length > 0 ? `
          <h4>Discrepancies:</h4>
          <ul>
            ${data.balanceAudit.discrepancies.map(d => 
              `<li><strong>${d.email}:</strong> Profile: ${d.profileBalance.toLocaleString()} sats, Calculated: ${d.calculatedBalance.toLocaleString()} sats, Difference: ${d.difference.toLocaleString()} sats</li>`
            ).join('')}
          </ul>
        ` : ''}
      `
    }

    <h3>API Health Checks</h3>
    
    <h4>Voltage Lightning Node</h4>
    ${data.apiHealth.voltage.status === 'online' 
      ? `
        <p style="color: green; font-weight: bold;">✅ Voltage API: Online</p>
        <ul>
          <li><strong>Node Balance:</strong> ${data.apiHealth.voltage.nodeBalance.toLocaleString()} sats</li>
          <li><strong>Balance Discrepancy:</strong> ${data.apiHealth.voltage.discrepancy.toLocaleString()} sats</li>
        </ul>
      `
      : `
        <p style="color: red; font-weight: bold;">❌ Voltage API: ${data.apiHealth.voltage.status.toUpperCase()}</p>
        ${data.apiHealth.voltage.error ? `<p style="color: red;">Error: ${data.apiHealth.voltage.error}</p>` : ''}
      `
    }
    
    <h4>Groq AI API</h4>
    ${data.apiHealth.groq.status === 'online' 
      ? '<p style="color: green; font-weight: bold;">✅ Groq API: Online</p>'
      : `
        <p style="color: red; font-weight: bold;">❌ Groq API: ${data.apiHealth.groq.status.toUpperCase()}</p>
        ${data.apiHealth.groq.error ? `<p style="color: red;">Error: ${data.apiHealth.groq.error}</p>` : ''}
      `
    }
    
    <h4>Resend Email API</h4>
    ${data.apiHealth.resend.status === 'online' 
      ? '<p style="color: green; font-weight: bold;">✅ Resend API: Online</p>'
      : `
        <p style="color: red; font-weight: bold;">❌ Resend API: ${data.apiHealth.resend.status.toUpperCase()}</p>
        ${data.apiHealth.resend.error ? `<p style="color: red;">Error: ${data.apiHealth.resend.error}</p>` : ''}
      `
    }

    <hr>
    <p><small>Generated at ${new Date().toLocaleString()}</small></p>
  `
}

export async function sendDailySummaryEmail(toEmail: string = 'brianmurray03@gmail.com') {
  console.log('[DAILY SUMMARY DEBUG] Starting sendDailySummaryEmail function')
  console.log('[DAILY SUMMARY DEBUG] toEmail:', toEmail)
  
  try {
    console.log('[DAILY SUMMARY DEBUG] Generating daily summary data...')
    const data = await getDailySummaryData()
    console.log('[DAILY SUMMARY DEBUG] Data generated successfully:', JSON.stringify(data, null, 2))
    
    console.log('[DAILY SUMMARY DEBUG] Generating email content...')
    const emailHTML = generateEmailHTML(data)
    console.log('[DAILY SUMMARY DEBUG] Email HTML generated, length:', emailHTML.length)
    
    console.log('[DAILY SUMMARY DEBUG] About to call sendEmail...')
    const result = await sendEmail(
      toEmail,
      `Ganamos Daily Summary - ${new Date().toLocaleDateString()}`,
      emailHTML
    )
    console.log('[DAILY SUMMARY DEBUG] sendEmail result:', JSON.stringify(result, null, 2))

    if (result.success) {
      console.log('[DAILY SUMMARY DEBUG] Daily summary email sent successfully')
      return { success: true, messageId: result.messageId }
    } else {
      console.error('[DAILY SUMMARY DEBUG] Failed to send daily summary email:', result.error)
      return { success: false, error: result.error }
    }
  } catch (error) {
    console.error('[DAILY SUMMARY DEBUG] Exception in sendDailySummaryEmail:', error)
    console.error('[DAILY SUMMARY DEBUG] Exception stack:', error instanceof Error ? error.stack : 'No stack')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
