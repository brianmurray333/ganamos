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

async function deleteOldAndCreateNew() {
  console.log('🔄 Deleting old Charlotte and creating a brand new one...')
  console.log('')

  try {
    // First, let's delete the old Charlotte account completely
    console.log('🗑️  Deleting old Charlotte account...')
    
    // Delete the connection first
    const { error: deleteConnError } = await supabase
      .from('connected_accounts')
      .delete()
      .eq('connected_user_id', '35641d69-5b40-4ef5-a219-f856f3c9a379')

    if (deleteConnError) {
      console.error('❌ Error deleting connection:', deleteConnError)
    } else {
      console.log('✅ Connection deleted')
    }

    // Delete the profile
    const { error: deleteProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', '35641d69-5b40-4ef5-a219-f856f3c9a379')

    if (deleteProfileError) {
      console.error('❌ Error deleting profile:', deleteProfileError)
    } else {
      console.log('✅ Profile deleted')
    }

    console.log('')
    console.log('🆕 Creating brand new Charlotte account...')

    // Create a brand new Charlotte account
    const newChildId = crypto.randomUUID()
    const newChildEmail = `child-${newChildId}@ganamos.app`
    const newUsername = 'charlotte'

    // Create the new profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: newChildId,
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
      console.error('❌ Error creating new profile:', profileError)
      return
    }

    console.log('✅ New profile created')

    // Create the connection to Brian
    const brianId = 'dce58449-faa0-413e-8b7a-6e607d280beb'
    const { error: connectionError } = await supabase
      .from('connected_accounts')
      .insert({
        primary_user_id: brianId,
        connected_user_id: newChildId,
        created_at: new Date().toISOString()
      })

    if (connectionError) {
      console.error('❌ Error creating connection:', connectionError)
      return
    }

    console.log('✅ Connection created')

    console.log('')
    console.log('🎉 Brand new Charlotte account created successfully!')
    console.log(`   New ID: ${newChildId}`)
    console.log(`   New Email: ${newChildEmail}`)
    console.log(`   Username: ${newUsername}`)
    console.log(`   Status: active`)
    console.log('   Should now appear in Family section')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

deleteOldAndCreateNew()
