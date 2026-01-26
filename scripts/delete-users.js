// Script to safely delete users by removing all foreign key dependencies first
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Please ensure .env.local exists.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const userIdsToDelete = [
  'f426b48a-463b-43a1-884c-49f0a0fa1e77' // No email
]

async function deleteUserSafely(userId) {
  console.log(`\n🗑️  Deleting user: ${userId}`)
  console.log('='.repeat(80))

  try {
    // 1. Delete transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (txError) {
      console.error(`❌ Error deleting transactions:`, txError.message)
    } else {
      console.log(`✅ Deleted ${transactions?.length || 0} transactions`)
    }

    // 2. Delete posts
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (postsError) {
      console.error(`❌ Error deleting posts:`, postsError.message)
    } else {
      console.log(`✅ Deleted ${posts?.length || 0} posts`)
    }

    // 3. Delete comments
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (commentsError) {
      console.error(`❌ Error deleting comments:`, commentsError.message)
    } else {
      console.log(`✅ Deleted ${comments?.length || 0} comments`)
    }

    // 4. Delete group memberships
    const { data: memberships, error: membershipsError } = await supabase
      .from('group_members')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (membershipsError) {
      console.error(`❌ Error deleting group memberships:`, membershipsError.message)
    } else {
      console.log(`✅ Deleted ${memberships?.length || 0} group memberships`)
    }

    // 5. Delete account connections (where user is primary)
    const { data: primaryConnections, error: primaryError } = await supabase
      .from('account_connections')
      .delete()
      .eq('primary_user_id', userId)
      .select()
    
    if (primaryError) {
      console.error(`❌ Error deleting primary account connections:`, primaryError.message)
    } else {
      console.log(`✅ Deleted ${primaryConnections?.length || 0} primary account connections`)
    }

    // 6. Delete account connections (where user is connected)
    const { data: connectedConnections, error: connectedError } = await supabase
      .from('account_connections')
      .delete()
      .eq('connected_user_id', userId)
      .select()
    
    if (connectedError) {
      console.error(`❌ Error deleting connected account connections:`, connectedError.message)
    } else {
      console.log(`✅ Deleted ${connectedConnections?.length || 0} connected account connections`)
    }

    // 7. Delete devices
    const { data: devices, error: devicesError } = await supabase
      .from('devices')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (devicesError) {
      console.error(`❌ Error deleting devices:`, devicesError.message)
    } else {
      console.log(`✅ Deleted ${devices?.length || 0} devices`)
    }

    // 8. Delete activities
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (activitiesError) {
      console.error(`❌ Error deleting activities:`, activitiesError.message)
    } else {
      console.log(`✅ Deleted ${activities?.length || 0} activities`)
    }

    // 9. Finally, delete the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select()
    
    if (profileError) {
      console.error(`❌ Error deleting profile:`, profileError.message)
      return false
    } else {
      console.log(`✅ Deleted profile`)
      return true
    }

  } catch (error) {
    console.error(`❌ Unexpected error:`, error.message)
    return false
  }
}

async function deleteUsers() {
  console.log('🗑️  USER DELETION SCRIPT')
  console.log('='.repeat(80))
  console.log(`Deleting ${userIdsToDelete.length} users...`)

  let successCount = 0
  let failCount = 0

  for (const userId of userIdsToDelete) {
    const success = await deleteUserSafely(userId)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log('\n📊 DELETION SUMMARY')
  console.log('='.repeat(80))
  console.log(`✅ Successfully deleted: ${successCount} users`)
  console.log(`❌ Failed to delete: ${failCount} users`)
}

deleteUsers().catch(console.error)
