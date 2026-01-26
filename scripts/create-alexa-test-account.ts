/**
 * Script to create a test account for Alexa skill certification
 * Run with: npx ts-node scripts/create-alexa-test-account.ts
 */

import { createClient } from '@supabase/supabase-js'

// Use your production Supabase credentials
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const TEST_EMAIL = 'alexa-reviewer@ganamos.earth'
const TEST_PASSWORD = 'GanamosTest2024!'
const TEST_NAME = 'Alexa Reviewer'
const TEST_USERNAME = 'alexa-reviewer'

async function createTestAccount() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_SECRET_API_KEY or SUPABASE_SERVICE_ROLE_KEY is required')
    console.log('Run with: SUPABASE_SECRET_API_KEY=xxx npx ts-node scripts/create-alexa-test-account.ts')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  console.log('Creating test account for Alexa certification...\n')

  // Step 1: Create the auth user
  console.log('1. Creating auth user...')
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true, // Auto-confirm email
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('   User already exists, fetching existing user...')
      const { data: users } = await supabase.auth.admin.listUsers()
      const existingUser = users?.users?.find(u => u.email === TEST_EMAIL)
      if (existingUser) {
        console.log(`   Found existing user: ${existingUser.id}`)
        // Update password just in case
        await supabase.auth.admin.updateUserById(existingUser.id, {
          password: TEST_PASSWORD
        })
        console.log('   Password updated.')
      }
    } else {
      console.error('   Error creating user:', authError.message)
      process.exit(1)
    }
  } else {
    console.log(`   Created user: ${authData.user.id}`)
  }

  // Get the user ID
  const { data: users } = await supabase.auth.admin.listUsers()
  const user = users?.users?.find(u => u.email === TEST_EMAIL)
  
  if (!user) {
    console.error('Could not find user after creation')
    process.exit(1)
  }

  const userId = user.id

  // Step 2: Create or update profile
  console.log('\n2. Creating/updating profile...')
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: TEST_EMAIL,
      name: TEST_NAME,
      username: TEST_USERNAME,
      balance: 5000, // Give them 5000 sats to play with
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    console.error('   Error creating profile:', profileError.message)
  } else {
    console.log('   Profile created with 5000 sats balance')
  }

  // Step 3: Create a test group
  console.log('\n3. Creating test group...')
  const groupId = crypto.randomUUID()
  const { error: groupError } = await supabase
    .from('groups')
    .insert({
      id: groupId,
      name: 'Alexa Test Family',
      description: 'Test group for Alexa skill certification',
      created_by: userId,
      group_code: 'TEST',
      invite_code: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (groupError) {
    if (groupError.message.includes('duplicate')) {
      console.log('   Group with code TEST already exists')
      // Find existing group
      const { data: existingGroup } = await supabase
        .from('groups')
        .select('id')
        .eq('group_code', 'TEST')
        .single()
      if (existingGroup) {
        console.log(`   Using existing group: ${existingGroup.id}`)
      }
    } else {
      console.error('   Error creating group:', groupError.message)
    }
  } else {
    console.log(`   Created group: ${groupId}`)
  }

  // Get the group ID (either new or existing)
  const { data: testGroup } = await supabase
    .from('groups')
    .select('id')
    .eq('group_code', 'TEST')
    .single()

  const finalGroupId = testGroup?.id || groupId

  // Step 4: Add user to group as admin
  console.log('\n4. Adding user to group...')
  const { error: memberError } = await supabase
    .from('group_members')
    .upsert({
      group_id: finalGroupId,
      user_id: userId,
      role: 'admin',
      status: 'approved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (memberError) {
    console.error('   Error adding to group:', memberError.message)
  } else {
    console.log('   Added as group admin')
  }

  // Step 5: Create some sample jobs
  console.log('\n5. Creating sample jobs...')
  const sampleJobs = [
    { title: 'Clean the kitchen', description: 'Wash dishes, wipe counters, and sweep the floor', reward: 500 },
    { title: 'Take out trash', description: 'Empty all trash cans and take bags to the curb', reward: 200 },
    { title: 'Mow the lawn', description: 'Mow front and back yard', reward: 1000 },
    { title: 'Walk the dog', description: 'Take the dog for a 20 minute walk around the neighborhood', reward: 300 },
    { title: 'Fold laundry', description: 'Fold the clean laundry and put it away', reward: 400 },
  ]

  for (const job of sampleJobs) {
    const { error: jobError } = await supabase
      .from('posts')
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        created_by: TEST_NAME,
        title: job.title,
        description: job.description,
        image_url: '/images/alexa-job-default.jpg',
        reward: job.reward,
        claimed: false,
        fixed: false,
        group_id: finalGroupId,
        created_at: new Date().toISOString(),
      })

    if (jobError) {
      console.error(`   Error creating job "${job.title}":`, jobError.message)
    } else {
      console.log(`   Created: ${job.title} (${job.reward} sats)`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('TEST ACCOUNT CREATED SUCCESSFULLY!')
  console.log('='.repeat(50))
  console.log('')
  console.log('📧 Email:    ', TEST_EMAIL)
  console.log('🔑 Password: ', TEST_PASSWORD)
  console.log('👤 Name:     ', TEST_NAME)
  console.log('💰 Balance:  ', '5000 sats')
  console.log('👥 Group:    ', 'Alexa Test Family (code: TEST)')
  console.log('📋 Jobs:     ', '5 sample jobs created')
  console.log('')
  console.log('Give these credentials to Amazon for certification testing.')
  console.log('')
}

createTestAccount().catch(console.error)

