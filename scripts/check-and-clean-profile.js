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

async function checkAndCleanProfile() {
  console.log('🔍 Checking for existing profile with ID: ab7dbcc3-057b-4465-b8b7-b3ffa13442ab')
  console.log('')

  try {
    // Check if profile exists
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', 'ab7dbcc3-057b-4465-b8b7-b3ffa13442ab')
      .single()

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('❌ Error checking profile:', profileError)
      return
    }

    if (existingProfile) {
      console.log('📊 Found existing profile:')
      console.log(`   ID: ${existingProfile.id}`)
      console.log(`   Name: ${existingProfile.name}`)
      console.log(`   Email: ${existingProfile.email}`)
      console.log(`   Status: ${existingProfile.status || 'active'}`)
      console.log('')

      // Delete the profile
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', 'ab7dbcc3-057b-4465-b8b7-b3ffa13442ab')

      if (deleteProfileError) {
        console.error('❌ Error deleting profile:', deleteProfileError)
      } else {
        console.log('✅ Profile deleted')
      }

      // Delete any connections
      const { error: deleteConnError } = await supabase
        .from('connected_accounts')
        .delete()
        .eq('connected_user_id', 'ab7dbcc3-057b-4465-b8b7-b3ffa13442ab')

      if (deleteConnError) {
        console.error('❌ Error deleting connections:', deleteConnError)
      } else {
        console.log('✅ Connections deleted')
      }
    } else {
      console.log('✅ No existing profile found')
    }

    console.log('')
    console.log('🆕 Now creating fresh Charlotte account...')

    // Create the profile using the auth user ID
    const { error: profileError2 } = await supabase
      .from('profiles')
      .insert({
        id: 'ab7dbcc3-057b-4465-b8b7-b3ffa13442ab', // Use the auth user ID
        name: 'Charlotte',
        username: 'charlotte',
        email: 'child-2e3eac29-40b1-40e7-904b-cd9da536a591@ganamos.app',
        avatar_url: null,
        balance: 0,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (profileError2) {
      console.error('❌ Error creating profile:', profileError2)
      return
    }

    console.log('✅ Profile created')

    // Create the connection to Brian
    const brianId = 'dce58449-faa0-413e-8b7a-6e607d280beb'
    const { error: connectionError } = await supabase
      .from('connected_accounts')
      .insert({
        primary_user_id: brianId,
        connected_user_id: 'ab7dbcc3-057b-4465-b8b7-b3ffa13442ab',
        created_at: new Date().toISOString()
      })

    if (connectionError) {
      console.error('❌ Error creating connection:', connectionError)
      return
    }

    console.log('✅ Connection created')

    console.log('')
    console.log('🎉 Charlotte account created successfully!')
    console.log(`   ID: ab7dbcc3-057b-4465-b8b7-b3ffa13442ab`)
    console.log(`   Name: Charlotte`)
    console.log(`   Username: charlotte`)
    console.log(`   Status: active`)
    console.log('   Should now appear in Family section')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkAndCleanProfile()
