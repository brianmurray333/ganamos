/**
 * 🎭 HACKER SCRIPT - Production Penetration Tests
 * 
 * This script simulates real attack vectors that hackers might use.
 * It runs against the production Supabase database using a dedicated test account.
 * 
 * ALL ATTACKS SHOULD FAIL. If any attack succeeds, the deploy should be blocked.
 * 
 * Setup:
 * 1. Create a test account: testuser+hacker@example.com (or similar)
 * 2. Set username to 'hacker' 
 * 3. Give it a small balance (1000 sats)
 * 4. Set environment variables:
 *    - HACKER_TEST_EMAIL=testuser+hacker@example.com
 *    - HACKER_TEST_PASSWORD=<password>
 * 
 * Run: npm run test:security
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const HACKER_EMAIL = process.env.HACKER_TEST_EMAIL || 'testuser+hacker@example.com'
const HACKER_PASSWORD = process.env.HACKER_TEST_PASSWORD

// Test account details (set after login)
let hackerId: string
let hackerUsername: string
let originalBalance: number
let originalPetCoins: number

// Flag to indicate if tests should run
let testsReady = false
let skipReason = ''

// Supabase client
let supabase: SupabaseClient

// Helper to skip test if not ready
function requireAuth() {
  if (!testsReady) {
    console.log(`   ⚠️  Skipping: ${skipReason}`)
    return false
  }
  return true
}

describe('🎭 Hacker Script - Security Penetration Tests', () => {
  beforeAll(async () => {
    // Check for required environment variables
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      skipReason = 'Missing SUPABASE credentials'
      console.warn('⚠️  Skipping security tests: Missing SUPABASE_URL or SUPABASE_ANON_KEY')
      return
    }
    
    if (!HACKER_PASSWORD) {
      skipReason = 'Missing HACKER_TEST_PASSWORD'
      console.warn('⚠️  Skipping security tests: Missing HACKER_TEST_PASSWORD environment variable')
      return
    }

    // Create Supabase client
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    // Sign in as hacker test account
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: HACKER_EMAIL,
      password: HACKER_PASSWORD,
    })

    if (authError) {
      throw new Error(`❌ CRITICAL: Failed to authenticate hacker test account: ${authError.message}\n` +
        `   Email: ${HACKER_EMAIL}\n` +
        `   Verify the test account exists and credentials are correct in GitHub secrets.`)
    }

    hackerId = authData.user!.id

    // Get hacker profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, balance, pet_coins')
      .eq('id', hackerId)
      .single()

    if (profileError || !profile) {
      throw new Error(`Failed to fetch hacker profile: ${profileError?.message}`)
    }

    hackerUsername = profile.username
    originalBalance = profile.balance
    originalPetCoins = profile.pet_coins

    // All setup successful - tests can run
    testsReady = true

    console.log(`\n🎭 Hacker account ready:`)
    console.log(`   ID: ${hackerId}`)
    console.log(`   Username: @${hackerUsername}`)
    console.log(`   Balance: ${originalBalance} sats`)
    console.log(`   Pet Coins: ${originalPetCoins}\n`)
  })

  afterAll(async () => {
    // Skip if tests weren't run
    if (!supabase || !hackerId) return

    // Verify balance hasn't changed (no attacks succeeded)
    const { data: profile } = await supabase
      .from('profiles')
      .select('balance, pet_coins')
      .eq('id', hackerId)
      .single()

    if (profile) {
      if (profile.balance !== originalBalance) {
        console.error(`\n🚨 CRITICAL: Balance changed from ${originalBalance} to ${profile.balance}!`)
      }
      if (profile.pet_coins !== originalPetCoins) {
        console.error(`\n🚨 CRITICAL: Pet coins changed from ${originalPetCoins} to ${profile.pet_coins}!`)
      }
    }

    await supabase.auth.signOut()
  })

  // ============================================================================
  // ATTACK 1: Direct Balance Update
  // ============================================================================
  describe('Attack 1: Direct Balance Update', () => {
    it('should BLOCK direct balance update via profiles table', async () => {
      if (!requireAuth()) return

      const { error } = await supabase
        .from('profiles')
        .update({ balance: 1000000 })
        .eq('id', hackerId)

      // The trigger should block this - we expect either an error OR silent failure
      // Silent failure is OK because the trigger uses NEW.balance = OLD.balance
      
      // Verify balance is unchanged
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', hackerId)
        .single()

      expect(profile?.balance).toBe(originalBalance)
    })

    it('should BLOCK direct pet_coins update via profiles table', async () => {
      if (!requireAuth()) return

      const { error } = await supabase
        .from('profiles')
        .update({ pet_coins: 1000000 })
        .eq('id', hackerId)

      // Verify pet_coins is unchanged
      const { data: profile } = await supabase
        .from('profiles')
        .select('pet_coins')
        .eq('id', hackerId)
        .single()

      expect(profile?.pet_coins).toBe(originalPetCoins)
    })
  })

  // ============================================================================
  // ATTACK 2: Insert Fake Transaction
  // ============================================================================
  describe('Attack 2: Insert Fake Transaction', () => {
    it('should BLOCK inserting a fake deposit transaction', async () => {
      if (!requireAuth()) return

      const { error } = await supabase
        .from('transactions')
        .insert({
          user_id: hackerId,
          type: 'deposit',
          amount: 1000000,
          status: 'completed',
          memo: 'Fake deposit 😈'
        })

      expect(error).toBeTruthy()
      expect(error?.code).toBe('42501') // Row-level security violation
    })

    it('should BLOCK inserting a fake internal transfer', async () => {
      if (!requireAuth()) return

      const { error } = await supabase
        .from('transactions')
        .insert({
          user_id: hackerId,
          type: 'internal',
          amount: 1000000,
          status: 'completed',
          memo: 'Fake transfer 😈'
        })

      expect(error).toBeTruthy()
      expect(error?.code).toBe('42501')
    })
  })

  // ============================================================================
  // ATTACK 3: Modify Existing Transactions
  // ============================================================================
  describe('Attack 3: Modify Existing Transactions', () => {
    it('should BLOCK updating transaction amounts', async () => {
      if (!requireAuth()) return

      // First, get any transaction for this user
      const { data: transactions } = await supabase
        .from('transactions')
        .select('id, amount')
        .eq('user_id', hackerId)
        .limit(1)

      if (!transactions || transactions.length === 0) {
        console.log('   ⚠️  No transactions found - skipping update test')
        return
      }

      const txId = transactions[0].id
      const originalAmount = transactions[0].amount

      const { error } = await supabase
        .from('transactions')
        .update({ amount: 1000000 })
        .eq('id', txId)

      // Verify amount is unchanged
      const { data: tx } = await supabase
        .from('transactions')
        .select('amount')
        .eq('id', txId)
        .single()

      expect(tx?.amount).toBe(originalAmount)
    })

    it('should BLOCK changing transaction status to completed', async () => {
      if (!requireAuth()) return

      const { data: transactions } = await supabase
        .from('transactions')
        .select('id, status')
        .eq('user_id', hackerId)
        .eq('status', 'pending')
        .limit(1)

      if (!transactions || transactions.length === 0) {
        console.log('   ⚠️  No pending transactions found - skipping status test')
        return
      }

      const txId = transactions[0].id

      const { error } = await supabase
        .from('transactions')
        .update({ status: 'completed' })
        .eq('id', txId)

      // Should fail or be blocked
      const { data: tx } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', txId)
        .single()

      expect(tx?.status).toBe('pending')
    })
  })

  // ============================================================================
  // ATTACK 4: Update Other Users' Profiles
  // ============================================================================
  describe('Attack 4: Update Other Users', () => {
    it('should BLOCK updating another user\'s balance', async () => {
      if (!requireAuth()) return

      // Get a different user
      const { data: otherUsers } = await supabase
        .from('profiles')
        .select('id, balance')
        .neq('id', hackerId)
        .limit(1)

      if (!otherUsers || otherUsers.length === 0) {
        console.log('   ⚠️  No other users found - skipping')
        return
      }

      const otherUserId = otherUsers[0].id
      const otherOriginalBalance = otherUsers[0].balance

      const { error } = await supabase
        .from('profiles')
        .update({ balance: 0 })
        .eq('id', otherUserId)

      // Verify balance is unchanged
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', otherUserId)
        .single()

      expect(profile?.balance).toBe(otherOriginalBalance)
    })

    it('should BLOCK inserting transactions for other users', async () => {
      if (!requireAuth()) return

      const { data: otherUsers } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', hackerId)
        .limit(1)

      if (!otherUsers || otherUsers.length === 0) {
        console.log('   ⚠️  No other users found - skipping')
        return
      }

      const { error } = await supabase
        .from('transactions')
        .insert({
          user_id: otherUsers[0].id,
          type: 'deposit',
          amount: 1000000,
          status: 'completed',
          memo: 'Stealing from others 😈'
        })

      expect(error).toBeTruthy()
    })
  })

  // ============================================================================
  // ATTACK 5: Access Admin Tables
  // ============================================================================
  describe('Attack 5: Access Admin Tables', () => {
    it('should BLOCK modifying system_settings', async () => {
      if (!requireAuth()) return

      // First get the current value
      const { data: before } = await supabase
        .from('system_settings')
        .select('withdrawals_enabled')
        .eq('id', 'main')
        .single()

      const originalValue = before?.withdrawals_enabled

      // Try to flip the value (hacker attempting to enable/disable withdrawals)
      const { error, count } = await supabase
        .from('system_settings')
        .update({ withdrawals_enabled: !originalValue })
        .eq('id', 'main')
        .select()

      // RLS doesn't throw error, it just returns empty result (0 rows affected)
      // Either we get an error, or the update affected 0 rows
      const wasBlocked = error !== null || (count === 0 || count === null)
      
      // Verify the value didn't actually change
      const { data: after } = await supabase
        .from('system_settings')
        .select('withdrawals_enabled')
        .eq('id', 'main')
        .single()

      expect(after?.withdrawals_enabled).toBe(originalValue)
      expect(wasBlocked).toBe(true)
    })

    it('should BLOCK reading withdrawal_audit_logs', async () => {
      if (!requireAuth()) return

      const { data, error } = await supabase
        .from('withdrawal_audit_logs')
        .select('*')
        .limit(1)

      // Should return empty or error
      expect(data?.length || 0).toBe(0)
    })
  })

  // ============================================================================
  // ATTACK 6: Bypass Withdrawal Limits via Direct DB
  // ============================================================================
  describe('Attack 6: Bypass Withdrawal Controls', () => {
    it('should NOT be able to create withdrawal without API', async () => {
      if (!requireAuth()) return

      // Try to insert a withdrawal transaction directly
      const { error } = await supabase
        .from('transactions')
        .insert({
          user_id: hackerId,
          type: 'withdrawal',
          amount: 50000,
          status: 'completed',
          memo: 'Bypass withdrawal 😈'
        })

      expect(error).toBeTruthy()
      expect(error?.code).toBe('42501')
    })
  })

  // ============================================================================
  // ATTACK 7: RPC Function Exploitation
  // ============================================================================
  describe('Attack 7: RPC Function Exploitation', () => {
    it('should BLOCK calling transfer with inflated balance', async () => {
      if (!requireAuth()) return

      // This tests the reconciliation check in transfer_sats_to_username
      // The function should fail if stored balance doesn't match calculated balance
      
      // First, try to find a user to "transfer" to
      const { data: targetUser } = await supabase
        .from('profiles')
        .select('username')
        .neq('id', hackerId)
        .not('username', 'is', null)
        .limit(1)
        .single()

      if (!targetUser) {
        console.log('   ⚠️  No target user found - skipping')
        return
      }

      // Try to transfer more than we have
      const { data, error } = await supabase
        .rpc('transfer_sats_to_username', {
          p_from_user_id: hackerId,
          p_to_username: targetUser.username,
          p_amount: originalBalance + 100000, // More than we have
          p_memo: 'Overdraft attack 😈'
        })

      // Should fail due to insufficient balance
      if (data && typeof data === 'object' && 'success' in data) {
        expect(data.success).toBe(false)
      } else {
        expect(error).toBeTruthy()
      }
    })
  })

  // ============================================================================
  // ATTACK 8: Access Connected Accounts Table
  // ============================================================================
  describe('Attack 8: Connected Accounts Manipulation', () => {
    it('should BLOCK creating fake connected account relationships', async () => {
      if (!requireAuth()) return

      // Try to make ourselves a "parent" of another user
      const { data: otherUsers } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', hackerId)
        .limit(1)

      if (!otherUsers || otherUsers.length === 0) {
        console.log('   ⚠️  No other users found - skipping')
        return
      }

      const { error } = await supabase
        .from('connected_accounts')
        .insert({
          primary_user_id: hackerId,
          connected_user_id: otherUsers[0].id
        })

      // Should be blocked
      expect(error).toBeTruthy()
    })
  })

  // ============================================================================
  // SUMMARY
  // ============================================================================
  afterAll(() => {
    console.log('\n' + '='.repeat(60))
    console.log('🎭 HACKER SCRIPT COMPLETE')
    console.log('='.repeat(60))
    console.log('\nIf you see this message and all tests passed,')
    console.log('your security controls are working correctly! 🛡️\n')
  })
})

