const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SECRET_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function convertChildAccountToBrian() {
  console.log('👶 Converting child-01d88631-ad2a-4ca5-95ba-d7933c48b9ed@ganamos.app to child of admin@example.com...')
  console.log('')

  try {
    // Step 1: Get the child account profile
    console.log('🔍 Step 1: Getting child account profile...')
    const childId = 'a6c07129-6f99-4bdd-ba12-b1756f681af6' // This is the user_id for the child account
    const { data: childProfile, error: childError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', childId)
      .single()

    if (childError || !childProfile) {
      console.error('❌ Error finding child account profile:', childError)
      return
    }

    console.log(`📊 Found child account profile:`)
    console.log(`   ID: ${childProfile.id}`)
    console.log(`   Email: ${childProfile.email}`)
    console.log(`   Current Balance: ${childProfile.balance} sats`)
    console.log(`   Name: ${childProfile.name}`)
    console.log('')

    // Step 2: Get Brian's profile
    console.log('🔍 Step 2: Getting admin@example.com profile...')
    const { data: brianProfile, error: brianError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'admin@example.com')
      .single()

    if (brianError || !brianProfile) {
      console.error('❌ Error finding admin@example.com profile:', brianError)
      return
    }

    console.log(`📊 Found admin@example.com profile:`)
    console.log(`   ID: ${brianProfile.id}`)
    console.log(`   Current Balance: ${brianProfile.balance} sats`)
    console.log('')

    // Step 3: Check if connection already exists
    console.log('🔍 Step 3: Checking for existing connection...')
    const { data: existingConnection, error: connectionError } = await supabase
      .from('connected_accounts')
      .select('*')
      .or(`primary_user_id.eq.${brianProfile.id},connected_user_id.eq.${brianProfile.id}`)
      .or(`primary_user_id.eq.${childProfile.id},connected_user_id.eq.${childProfile.id}`)

    if (connectionError) {
      console.error('❌ Error checking existing connections:', connectionError)
      return
    }

    if (existingConnection && existingConnection.length > 0) {
      console.log('⚠️  Connection already exists between these accounts')
      console.log('')
    } else {
      console.log('✅ No existing connection found')
      console.log('')
    }

    // Step 4: Create connected_accounts relationship
    console.log('🔗 Step 4: Creating connected_accounts relationship...')
    if (existingConnection && existingConnection.length > 0) {
      console.log('✅ Connection already exists between these accounts')
    } else {
      console.log('🔗 Creating connected_accounts relationship...')
      const { error: connectError } = await supabase
        .from('connected_accounts')
        .insert({
          primary_user_id: brianProfile.id,
          connected_user_id: childProfile.id
        })

      if (connectError) {
        console.error('❌ Error creating connection:', connectError)
        return
      }

      console.log('✅ Connected child account to admin@example.com')
    }
    console.log('')

    // Step 5: Update child's balance to match calculated balance (-100 sats)
    console.log('💰 Step 5: Updating child account balance to calculated balance...')
    const calculatedBalance = -100 // From the audit results
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ 
        balance: calculatedBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', childProfile.id)

    if (balanceError) {
      console.error('❌ Error updating balance:', balanceError)
      return
    }

    console.log(`✅ Updated balance: ${childProfile.balance} → ${calculatedBalance} sats`)
    console.log('')

    // Step 6: Verify the changes
    console.log('✅ Step 6: Verifying changes...')
    const { data: updatedChildProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', childProfile.id)
      .single()

    if (verifyError) {
      console.error('❌ Error verifying changes:', verifyError)
      return
    }

    console.log('📊 Updated child profile:')
    console.log(`   ID: ${updatedChildProfile.id}`)
    console.log(`   Email: ${updatedChildProfile.email}`)
    console.log(`   Balance: ${updatedChildProfile.balance} sats`)
    console.log(`   Name: ${updatedChildProfile.name}`)
    console.log('')

    // Step 7: Verify the connection
    const { data: connection, error: connectionVerifyError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('primary_user_id', brianProfile.id)
      .eq('connected_user_id', childProfile.id)
      .single()

    if (connectionVerifyError) {
      console.error('❌ Error verifying connection:', connectionVerifyError)
      return
    }

    console.log('📊 Connection verified:')
    console.log(`   Primary User: ${connection.primary_user_id} (admin@example.com)`)
    console.log(`   Connected User: ${connection.connected_user_id} (child account)`)
    console.log('')

    console.log('🎉 CONVERSION COMPLETE!')
    console.log('=====================')
    console.log('✅ Child account connected to admin@example.com')
    console.log('✅ Balance updated to calculated balance (-100 sats)')
    console.log('')
    console.log('💡 Next steps:')
    console.log('   - Run the balance audit script to verify the fix')
    console.log('   - Test the family account functionality')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

convertChildAccountToBrian()
