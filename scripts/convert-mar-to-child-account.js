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

async function convertMarToChildAccount() {
  console.log('👶 Converting mar@gmail.com to child account of admin@example.com...')
  console.log('')

  try {
    // Step 1: Get the current mar@gmail.com profile
    console.log('🔍 Step 1: Getting current mar@gmail.com profile...')
    const { data: marProfile, error: marError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'mar@gmail.com')
      .single()

    if (marError || !marProfile) {
      console.error('❌ Error finding mar@gmail.com profile:', marError)
      return
    }

    console.log(`📊 Found mar@gmail.com profile:`)
    console.log(`   ID: ${marProfile.id}`)
    console.log(`   Current Balance: ${marProfile.balance} sats`)
    console.log(`   Name: ${marProfile.name}`)
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
      .or(`primary_user_id.eq.${marProfile.id},connected_user_id.eq.${marProfile.id}`)

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

    // Step 4: Check if connection already exists
    console.log('🔗 Step 4: Checking connected_accounts relationship...')
    if (existingConnection && existingConnection.length > 0) {
      console.log('✅ Connection already exists between these accounts')
    } else {
      console.log('🔗 Creating connected_accounts relationship...')
      const { error: connectError } = await supabase
        .from('connected_accounts')
        .insert({
          primary_user_id: brianProfile.id,
          connected_user_id: marProfile.id
        })

      if (connectError) {
        console.error('❌ Error creating connection:', connectError)
        return
      }

      console.log('✅ Connected mar@gmail.com as child account of admin@example.com')
    }
    console.log('')

    // Step 5: Update mar's email to child account format
    console.log('📧 Step 5: Updating mar@gmail.com email to child account format...')
    const newEmail = `child-${marProfile.id}@ganamos.app`
    
    const { error: emailError } = await supabase
      .from('profiles')
      .update({ 
        email: newEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', marProfile.id)

    if (emailError) {
      console.error('❌ Error updating email:', emailError)
      return
    }

    console.log(`✅ Updated email: mar@gmail.com → ${newEmail}`)
    console.log('')

    // Step 6: Update mar's balance to calculated balance
    console.log('💰 Step 6: Updating mar\'s balance to calculated balance...')
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ 
        balance: 8497,
        updated_at: new Date().toISOString()
      })
      .eq('id', marProfile.id)

    if (balanceError) {
      console.error('❌ Error updating balance:', balanceError)
      return
    }

    console.log(`✅ Updated balance: ${marProfile.balance} → 8,497 sats`)
    console.log('')

    // Step 7: Verify the changes
    console.log('✅ Step 7: Verifying changes...')
    const { data: updatedMarProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', marProfile.id)
      .single()

    if (verifyError) {
      console.error('❌ Error verifying changes:', verifyError)
      return
    }

    console.log('📊 Updated mar profile:')
    console.log(`   ID: ${updatedMarProfile.id}`)
    console.log(`   Email: ${updatedMarProfile.email}`)
    console.log(`   Balance: ${updatedMarProfile.balance} sats`)
    console.log(`   Name: ${updatedMarProfile.name}`)
    console.log('')

    // Step 8: Verify the connection
    const { data: connection, error: connectionVerifyError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('primary_user_id', brianProfile.id)
      .eq('connected_user_id', marProfile.id)
      .single()

    if (connectionVerifyError) {
      console.error('❌ Error verifying connection:', connectionVerifyError)
      return
    }

    console.log('📊 Connection verified:')
    console.log(`   Primary User: ${connection.primary_user_id} (admin@example.com)`)
    console.log(`   Connected User: ${connection.connected_user_id} (mar - now child account)`)
    console.log('')

    console.log('🎉 CONVERSION COMPLETE!')
    console.log('=====================')
    console.log('✅ mar@gmail.com converted to child account')
    console.log('✅ Connected to admin@example.com')
    console.log('✅ Email updated to child account format')
    console.log('✅ Balance updated to calculated balance (8,497 sats)')
    console.log('')
    console.log('💡 Next steps:')
    console.log('   - Run the balance audit script to verify the fix')
    console.log('   - Test the family account functionality')
    console.log('   - Update any hardcoded references to mar@gmail.com')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

convertMarToChildAccount()
