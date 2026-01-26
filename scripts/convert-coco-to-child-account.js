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

async function convertCocoToChildAccount() {
  console.log('👶 Converting coco@gmail.com to child account of admin@example.com...')
  console.log('')

  try {
    // Step 1: Get the current coco@gmail.com profile
    console.log('🔍 Step 1: Getting current coco@gmail.com profile...')
    const { data: cocoProfile, error: cocoError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'coco@gmail.com')
      .single()

    if (cocoError || !cocoProfile) {
      console.error('❌ Error finding coco@gmail.com profile:', cocoError)
      return
    }

    console.log(`📊 Found coco@gmail.com profile:`)
    console.log(`   ID: ${cocoProfile.id}`)
    console.log(`   Current Balance: ${cocoProfile.balance} sats`)
    console.log(`   Name: ${cocoProfile.name}`)
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
      .or(`primary_user_id.eq.${cocoProfile.id},connected_user_id.eq.${cocoProfile.id}`)

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
          connected_user_id: cocoProfile.id
        })

      if (connectError) {
        console.error('❌ Error creating connection:', connectError)
        return
      }

      console.log('✅ Connected coco@gmail.com as child account of admin@example.com')
    }
    console.log('')

    // Step 5: Update coco's email to child account format
    console.log('📧 Step 5: Updating coco@gmail.com email to child account format...')
    const newEmail = `child-${cocoProfile.id}@ganamos.app`
    
    const { error: emailError } = await supabase
      .from('profiles')
      .update({ 
        email: newEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', cocoProfile.id)

    if (emailError) {
      console.error('❌ Error updating email:', emailError)
      return
    }

    console.log(`✅ Updated email: coco@gmail.com → ${newEmail}`)
    console.log('')

    // Step 6: Update coco's balance to 0
    console.log('💰 Step 6: Updating coco\'s balance to 0...')
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ 
        balance: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', cocoProfile.id)

    if (balanceError) {
      console.error('❌ Error updating balance:', balanceError)
      return
    }

    console.log(`✅ Updated balance: ${cocoProfile.balance} → 0 sats`)
    console.log('')

    // Step 7: Verify the changes
    console.log('✅ Step 7: Verifying changes...')
    const { data: updatedCocoProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', cocoProfile.id)
      .single()

    if (verifyError) {
      console.error('❌ Error verifying changes:', verifyError)
      return
    }

    console.log('📊 Updated coco profile:')
    console.log(`   ID: ${updatedCocoProfile.id}`)
    console.log(`   Email: ${updatedCocoProfile.email}`)
    console.log(`   Balance: ${updatedCocoProfile.balance} sats`)
    console.log(`   Name: ${updatedCocoProfile.name}`)
    console.log('')

    // Step 8: Verify the connection
    const { data: connection, error: connectionVerifyError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('primary_user_id', brianProfile.id)
      .eq('connected_user_id', cocoProfile.id)
      .single()

    if (connectionVerifyError) {
      console.error('❌ Error verifying connection:', connectionVerifyError)
      return
    }

    console.log('📊 Connection verified:')
    console.log(`   Primary User: ${connection.primary_user_id} (admin@example.com)`)
    console.log(`   Connected User: ${connection.connected_user_id} (coco - now child account)`)
    console.log('')

    console.log('🎉 CONVERSION COMPLETE!')
    console.log('=====================')
    console.log('✅ coco@gmail.com converted to child account')
    console.log('✅ Connected to admin@example.com')
    console.log('✅ Email updated to child account format')
    console.log('✅ Balance updated to 0 sats')
    console.log('')
    console.log('💡 Next steps:')
    console.log('   - Run the balance audit script to verify the fix')
    console.log('   - Test the family account functionality')
    console.log('   - Update any hardcoded references to coco@gmail.com')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

convertCocoToChildAccount()


