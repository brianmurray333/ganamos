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

async function cleanAndCreateCharlotte() {
  console.log('🧹 Cleaning up and creating fresh Charlotte account...')
  console.log('')

  try {
    // First, let's see what Charlotte accounts exist
    const { data: existingCharlottes, error: charlotteError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', '%Charlotte%')

    if (charlotteError) {
      console.error('❌ Error fetching Charlotte profiles:', charlotteError)
      return
    }

    console.log(`📊 Found ${existingCharlottes?.length || 0} Charlotte profiles:`)
    existingCharlottes?.forEach(profile => {
      console.log(`   ID: ${profile.id}`)
      console.log(`   Name: ${profile.name}`)
      console.log(`   Email: ${profile.email}`)
      console.log(`   Status: ${profile.status || 'active'}`)
      console.log('   ---')
    })

    // Delete all existing Charlotte accounts
    if (existingCharlottes && existingCharlottes.length > 0) {
      console.log('🗑️  Deleting all existing Charlotte accounts...')
      
      for (const charlotte of existingCharlottes) {
        // Delete connection
        const { error: deleteConnError } = await supabase
          .from('connected_accounts')
          .delete()
          .eq('connected_user_id', charlotte.id)

        if (deleteConnError) {
          console.error(`❌ Error deleting connection for ${charlotte.id}:`, deleteConnError)
        }

        // Delete profile
        const { error: deleteProfileError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', charlotte.id)

        if (deleteProfileError) {
          console.error(`❌ Error deleting profile ${charlotte.id}:`, deleteProfileError)
        }

        // Delete auth user
        const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(charlotte.id)
        if (deleteAuthError) {
          console.error(`❌ Error deleting auth user ${charlotte.id}:`, deleteAuthError)
        }

        console.log(`✅ Deleted Charlotte account: ${charlotte.id}`)
      }
    }

    console.log('')
    console.log('🆕 Creating brand new Charlotte account...')

    // Generate new child account details
    const newChildId = crypto.randomUUID()
    const newChildEmail = `child-${newChildId}@ganamos.app`
    const newUsername = 'charlotte'
    const password = crypto.randomUUID() // Random password (won't be used for login)

    // Create the auth user first
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: newChildEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: 'Charlotte',
        avatar_url: null
      }
    })

    if (authError) {
      console.error('❌ Error creating auth user:', authError)
      return
    }

    console.log('✅ Auth user created')
    console.log(`   Auth User ID: ${authUser.user.id}`)

    // Create the profile using the actual auth user ID
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.user.id, // Use the actual auth user ID
        name: 'Charlotte',
        username: newUsername,
        email: newChildEmail,
        avatar_url: null,
        balance: 0,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (profileError) {
      console.error('❌ Error creating profile:', profileError)
      return
    }

    console.log('✅ Profile created')

    // Create the connection to Brian
    const brianId = 'dce58449-faa0-413e-8b7a-6e607d280beb'
    const { error: connectionError } = await supabase
      .from('connected_accounts')
      .insert({
        primary_user_id: brianId,
        connected_user_id: authUser.user.id, // Use the actual auth user ID
        created_at: new Date().toISOString()
      })

    if (connectionError) {
      console.error('❌ Error creating connection:', connectionError)
      return
    }

    console.log('✅ Connection created')

    console.log('')
    console.log('🎉 Brand new Charlotte account created successfully!')
    console.log(`   New ID: ${authUser.user.id}`)
    console.log(`   New Email: ${newChildEmail}`)
    console.log(`   Username: ${newUsername}`)
    console.log(`   Status: active`)
    console.log('   Should now appear in Family section')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

cleanAndCreateCharlotte()
