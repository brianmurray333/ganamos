import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'
import { sendEmail } from './email'

let supabase: SupabaseClient<Database> | null = null

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    // Use SUPABASE_SECRET_API_KEY (required - matches Vercel production)
    const supabaseKey = process.env.SUPABASE_SECRET_API_KEY
    
    console.log('[SUPABASE CLIENT] Environment check:', {
      hasUrl: !!supabaseUrl,
      hasSecretKey: !!process.env.SUPABASE_SECRET_API_KEY,
      hasFinalKey: !!supabaseKey,
      urlPrefix: supabaseUrl?.substring(0, 30),
      // Never log key prefixes - security risk
    })
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured')
    }
    supabase = createClient<Database>(
      supabaseUrl,
      supabaseKey
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
    // Import serverEnv for mock checking
    const { serverEnv } = await import('./env')
    
    // If using mocks, always return online
    if (serverEnv?.useMock) {
      console.log('[API HEALTH] Groq API (MOCK MODE): Online')
      return { status: 'online' }
    }

    // Test real GROQ API
    if (!serverEnv?.groq?.apiKey) {
      return {
        status: 'error',
        error: 'GROQ_API_KEY not configured'
      }
    }

    const { Groq } = await import('groq-sdk')
    
    const groq = new Groq({
      apiKey: serverEnv.groq.apiKey,
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

export async function getMergedPRs(): Promise<
  Array<{ number: number; title: string; url: string; mergedAt: Date }>
> {
  // Import centralized configuration
  const { serverEnv } = await import('./env')
  
  if (!serverEnv?.integrations.github.isConfigured) {
    console.warn('[PR SUMMARY] GitHub integration not configured, skipping PR fetch')
    return []
  }

  const { token, repo } = serverEnv.integrations.github

  try {
    // Calculate 24 hours ago for the search query
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const since = yesterday.toISOString().split('T')[0] // Format as YYYY-MM-DD
    
    // Use GitHub Search API to find PRs merged in the last 24 hours
    // This is more reliable than sorting by 'updated' which includes comments, labels, etc.
    const searchQuery = `repo:${repo} is:pr is:merged merged:>=${since}`
    
    // Use centralized URL getter (handles mock/real mode)
    const url = serverEnv.integrations.github.getSearchUrl(searchQuery)
    
    console.log('[PR SUMMARY] Fetching merged PRs from GitHub Search API:', url)
    console.log('[PR SUMMARY] Mock mode:', serverEnv.integrations.github.useMock)
    
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    }
    
    // Only add Authorization header for real GitHub API
    if (!serverEnv.integrations.github.useMock && token) {
      headers.Authorization = `token ${token}`
    }
    
    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const prs = data.items || []
    
    console.log('[PR SUMMARY] Fetched', prs.length, 'merged PRs from GitHub (total:', data.total_count || 0, ')')

    // Map to our format - search API already filtered by merge date
    // Note: Search API returns merged_at inside pull_request object, not at top level
    const mergedPRs = prs
      .filter((pr: any) => pr.pull_request?.merged_at) // Extra safety check
      .map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        mergedAt: new Date(pr.pull_request.merged_at),
      }))

    console.log('[PR SUMMARY] Found', mergedPRs.length, 'PRs merged in last 24 hours')
    
    return mergedPRs
  } catch (error) {
    console.error('[PR SUMMARY] Error fetching merged PRs:', error)
    throw error
  }
}

// Internal function for backward compatibility with email summaries
async function getMergedPRsForEmail(): Promise<{
  count: number
  prs: Array<{
    number: number
    title: string
    url: string
    mergedAt: string
  }>
}> {
  try {
    const mergedPRs = await getMergedPRs()
    return {
      count: mergedPRs.length,
      prs: mergedPRs.map(pr => ({
        ...pr,
        mergedAt: pr.mergedAt.toISOString(),
      })),
    }
  } catch (error) {
    console.error('[GITHUB PR] Error in getMergedPRsForEmail:', error)
    return { count: 0, prs: [] }
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

async function getDeviceCoinStats(yesterdayIso: string): Promise<Array<{
  deviceId: string
  petName: string
  petType: string
  userName: string
  coinsEarned: number
  coinsSpent: number
  netCoins: number
  lastSeenAt: string
}>> {
  console.log('[DEVICE COINS] Getting device coin stats...')
  const supabaseClient = getSupabaseClient()
  
  // Get all paired devices
  const { data: devices, error: devicesError } = await supabaseClient
    .from('devices')
    .select('id, pet_name, pet_type, user_id, created_at, last_seen_at')
    .eq('status', 'paired')
  
  if (devicesError || !devices) {
    console.error('[DEVICE COINS] Error fetching devices:', devicesError)
    return []
  }
  
  const deviceStats = []
  
  for (const device of devices) {
    // Get user name
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('name')
      .eq('id', device.user_id)
      .single()
    
    // Calculate coins earned (transactions since yesterday, after device was paired)
    const { data: earnings } = await supabaseClient
      .from('transactions')
      .select('amount')
      .eq('user_id', device.user_id)
      .eq('status', 'completed')
      .in('type', ['deposit', 'internal'])
      .gt('amount', 0)
      .gte('created_at', device.created_at)  // Only after device paired
      .gte('created_at', yesterdayIso)  // In last 24 hours
    
    const coinsEarned = earnings?.reduce((sum, tx) => sum + tx.amount, 0) || 0
    
    // Calculate coins spent (from pending_spends table)
    const { data: spends } = await supabaseClient
      .from('pending_spends')
      .select('amount')
      .eq('device_id', device.id)
      .gte('timestamp', yesterdayIso)
    
    const coinsSpent = spends?.reduce((sum, s) => sum + s.amount, 0) || 0
    
    deviceStats.push({
      deviceId: device.id,
      petName: device.pet_name,
      petType: device.pet_type,
      userName: profile?.name || 'Unknown',
      coinsEarned,
      coinsSpent,
      netCoins: coinsEarned - coinsSpent,
      lastSeenAt: device.last_seen_at || device.created_at
    })
  }
  
  console.log(`[DEVICE COINS] Found ${deviceStats.length} devices`)
  return deviceStats
}

// Get stats for a specific day (daysAgo: 0 = today, 1 = yesterday, etc.)
async function getDayStats(supabaseClient: SupabaseClient<Database>, daysAgo: number): Promise<DayStats> {
  const now = new Date()
  
  // Calculate start and end of the day
  const startOfDay = new Date(now)
  startOfDay.setDate(now.getDate() - daysAgo)
  startOfDay.setHours(0, 0, 0, 0)
  
  const endOfDay = new Date(startOfDay)
  endOfDay.setHours(23, 59, 59, 999)
  
  const startIso = startOfDay.toISOString()
  const endIso = endOfDay.toISOString()
  
  // Get transactions
  const { data: transactions } = await supabaseClient
    .from('transactions')
    .select('type')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .eq('status', 'completed')
  
  const transactionCount = transactions?.length || 0
  const deposits = transactions?.filter(t => t.type === 'deposit').length || 0
  const withdrawals = transactions?.filter(t => t.type === 'withdrawal').length || 0
  
  // Get posts created (new issues)
  const { count: postsCount } = await supabaseClient
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lte('created_at', endIso)
  
  // Get posts fixed
  const { count: fixesCount } = await supabaseClient
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .gte('fixed_at', startIso)
    .lte('fixed_at', endIso)
    .eq('fixed', true)
  
  // Get active users
  const { data: activeUserIds } = await supabaseClient
    .rpc('get_active_users_last_24h', { since_timestamp: startIso })
  
  // Filter to only users active within this specific day
  // Since the RPC gives us 24h from since_timestamp, we need to approximate
  const activeUsers = activeUserIds?.length || 0
  
  return {
    transactions: transactionCount,
    deposits,
    withdrawals,
    posts: postsCount || 0,
    fixes: fixesCount || 0,
    activeUsers
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

// Stats for a single day
export interface DayStats {
  transactions: number
  deposits: number
  withdrawals: number
  posts: number
  fixes: number
  activeUsers: number
}

export interface DailySummaryData {
  nodeBalance: {
    channel_balance: number
    pending_balance: number
    onchain_balance: number
    total_balance: number
  }
  // Balance breakdown - all sats in the system
  balanceBreakdown: {
    userBalances: number      // Sum of all profile.balance
    openIssuesBalance: number // Sum of rewards on unfixed, non-deleted posts
    paidOrdersBalance: number // Sum of paid pet_orders
    totalAppBalance: number   // Sum of above - should equal node balance
  }
  // Legacy field for backwards compatibility
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
  devices: Array<{
    deviceId: string
    petName: string
    petType: string
    userName: string
    coinsEarned: number
    coinsSpent: number
    netCoins: number
    lastSeenAt: string
  }>
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
  // Multi-day stats: index 0 = today, 1 = yesterday, etc.
  dailyStats: DayStats[]
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
  mergedPRs: {
    count: number
    prs: Array<{
      number: number
      title: string
      url: string
      mergedAt: string
    }>
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
  
  // =============================================
  // BALANCE BREAKDOWN - All sats in the system
  // =============================================
  
  // 1. User Balances (sum of all profile.balance)
  const { data: profiles } = await supabaseClient
    .from('profiles')
    .select('balance')
    
  const userBalances = profiles?.reduce((sum, profile) => sum + (profile.balance || 0), 0) || 0

  // 2. Open Issues Balance (sum of rewards on unfixed, non-deleted posts)
  const { data: openPosts } = await supabaseClient
    .from('posts')
    .select('reward')
    .eq('fixed', false)
    .is('deleted_at', null)
    .gt('reward', 0)
    
  const openIssuesBalance = openPosts?.reduce((sum, post) => sum + (post.reward || 0), 0) || 0

  // 3. Paid Orders Balance (sum of paid pet orders)
  const { data: paidOrders } = await supabaseClient
    .from('pet_orders')
    .select('total_price_sats')
    .eq('payment_status', 'paid')
    
  const paidOrdersBalance = paidOrders?.reduce((sum, order) => sum + (order.total_price_sats || 0), 0) || 0

  // Total App Balance (should equal node balance)
  const totalAppBalance = userBalances + openIssuesBalance + paidOrdersBalance
  
  // Legacy field for backwards compatibility
  const appTotalBalance = userBalances

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

  // Get device coin stats
  const devices = await getDeviceCoinStats(yesterdayIso)

  // Check API health and get merged PRs
  const [voltageHealth, groqHealth, resendHealth, mergedPRsData] = await Promise.all([
    checkVoltageAPI(),
    checkGroqAPI(),
    checkResendAPI(),
    getMergedPRsForEmail()
  ])

  // Get stats for the last 5 days (0 = today, 1 = yesterday, etc.)
  const dailyStats = await Promise.all([
    getDayStats(supabaseClient, 0),
    getDayStats(supabaseClient, 1),
    getDayStats(supabaseClient, 2),
    getDayStats(supabaseClient, 3),
    getDayStats(supabaseClient, 4)
  ])

  return {
    nodeBalance: nodeBalanceData.balances,
    balanceBreakdown: {
      userBalances,
      openIssuesBalance,
      paidOrdersBalance,
      totalAppBalance,
    },
    appTotalBalance, // Legacy field
    balanceAudit,
    devices,
    apiHealth: {
      voltage: voltageHealth,
      groq: groqHealth,
      resend: resendHealth
    },
    dailyStats,
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
    },
    mergedPRs: mergedPRsData
  }
}

export function generateEmailHTML(data: DailySummaryData): string {
  // Calculate the audit difference
  const difference = data.nodeBalance.total_balance - data.balanceBreakdown.totalAppBalance
  const differenceColor = Math.abs(difference) <= 100 ? '#666' : '#dc3545'
  const warningIcon = Math.abs(difference) > 100 ? '⚠️ ' : ''

  // Build the 5-day activity table rows
  const tableRows = data.dailyStats.map((day, index) => {
    const rowLabel = index === 0 ? '0' : `-${index}`
    return `
      <tr>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${rowLabel}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${day.transactions}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${day.deposits}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${day.withdrawals}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${day.posts}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${day.fixes}</td>
        <td style="padding: 4px 8px; border: 1px solid #ddd; text-align: center;">${day.activeUsers}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5;">
      <p style="margin: 0 0 4px 0; font-family: monospace; font-size: 15px;">
        <strong>${data.balanceBreakdown.totalAppBalance.toLocaleString()}s</strong> App Balance
      </p>
      <p style="margin: 0 0 4px 0; font-family: monospace; font-size: 15px;">
        <strong>${data.nodeBalance.total_balance.toLocaleString()}s</strong> Node Balance
      </p>
      <p style="margin: 0 0 16px 0; font-family: monospace; font-size: 15px; color: ${differenceColor};">
        ${warningIcon}<strong>${difference.toLocaleString()}s</strong> Difference
      </p>

      <table style="border-collapse: collapse; font-family: monospace; font-size: 13px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 4px 8px; border: 1px solid #ddd;"></th>
            <th style="padding: 4px 8px; border: 1px solid #ddd;" title="Transactions">Tx</th>
            <th style="padding: 4px 8px; border: 1px solid #ddd;" title="Deposits">D</th>
            <th style="padding: 4px 8px; border: 1px solid #ddd;" title="Withdrawals">W</th>
            <th style="padding: 4px 8px; border: 1px solid #ddd;" title="Posts">P</th>
            <th style="padding: 4px 8px; border: 1px solid #ddd;" title="Fixes">F</th>
            <th style="padding: 4px 8px; border: 1px solid #ddd;" title="Active Users">U</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `
}

export async function sendDailySummaryEmail(toEmail: string = 'admin@example.com') {
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
      `Ganamos - ${new Date().toLocaleDateString()}`,
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

/**
 * Send daily PR summary to Sphinx tribe
 */
export async function sendPRSummaryToSphinx() {
  console.log('[PR SUMMARY] Starting sendPRSummaryToSphinx function')
  
  try {
    // Import Sphinx integration
    const { postToSphinx, isSphinxEnabled } = await import('./sphinx')
    
    // Check if Sphinx is enabled
    if (!isSphinxEnabled()) {
      console.log('[PR SUMMARY] Sphinx integration is disabled')
      return { success: false, error: 'Sphinx integration is not enabled' }
    }
    
    console.log('[PR SUMMARY] Fetching merged PRs...')
    const mergedPRs = await getMergedPRs()
    console.log(`[PR SUMMARY] Found ${mergedPRs.length} merged PRs`)
    
    // Format the message for Sphinx
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    
    let content = `📊 Ganamos Daily Development Update - ${date}\n\n`
    
    if (mergedPRs.length === 0) {
      content += `No pull requests were merged in the last 24 hours.`
    } else {
      content += `🚀 ${mergedPRs.length} pull request${mergedPRs.length > 1 ? 's' : ''} merged:\n\n`
      
      mergedPRs.forEach((pr, index) => {
        content += `${index + 1}. ${pr.title}\n   ${pr.url}\n\n`
      })
      
      content += `Keep building! 💪`
    }
    
    console.log('[PR SUMMARY] Sending to Sphinx...')
    console.log('[PR SUMMARY] Content:', content)
    
    // Use Sphinx API directly to post the message
    // We need to call the Sphinx bot API with the formatted message
    const { serverEnv } = await import('./env')
    
    if (!serverEnv?.integrations.sphinx.isConfigured) {
      return { success: false, error: 'Sphinx configuration is incomplete' }
    }
    
    const sphinxApiUrl = serverEnv.integrations.sphinx.apiUrl
    const config = {
      chatPubkey: serverEnv.integrations.sphinx.chatPubkey,
      botId: serverEnv.integrations.sphinx.botId,
      botSecret: serverEnv.integrations.sphinx.botSecret
    }
    
    console.log('[PR SUMMARY] Sphinx API URL:', sphinxApiUrl)
    console.log('[PR SUMMARY] Config:', {
      chatPubkey: config.chatPubkey?.substring(0, 20) + '...',
      botId: config.botId,
      botSecret: config.botSecret ? '***SET***' : 'NOT SET'
    })
    
    const response = await fetch(sphinxApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_pubkey: config.chatPubkey,
        bot_id: config.botId,
        content: content,
        bot_secret: config.botSecret,
        action: 'broadcast'
      })
    })
    
    console.log('[PR SUMMARY] Sphinx API HTTP status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Sphinx API error: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json()
    
    // Log full response for debugging
    console.log('[PR SUMMARY] Sphinx API response:', JSON.stringify(result, null, 2))

    // Check for explicit error responses
    if (result.success === false || result.error) {
      throw new Error(`Sphinx returned error: ${result.error || 'Unknown error'}`)
    }

    // Validate that Sphinx actually broadcasted the message
    // A successful broadcast should return a message_id
    if (!result.message_id && result.success !== true) {
      console.warn('[PR SUMMARY] Sphinx response lacks message confirmation:', result)
      throw new Error('Sphinx did not confirm message was sent - missing message_id')
    }

    console.log('[PR SUMMARY] Successfully posted to Sphinx, message_id:', result.message_id)
    return { success: true, prCount: mergedPRs.length }
    
  } catch (error) {
    console.error('[PR SUMMARY] Exception in sendPRSummaryToSphinx:', error)
    console.error('[PR SUMMARY] Exception stack:', error instanceof Error ? error.stack : 'No stack')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
