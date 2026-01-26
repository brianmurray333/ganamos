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

async function checkCharlotteCreation() {
  console.log('🔍 Checking Charlotte child account creation...')
  console.log('')

  try {
    // Check for any profiles with "Charlotte" in the name
    const { data: charlotteProfiles, error: charlotteError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', '%Charlotte%')
      .order('created_at', { ascending: false })

    if (charlotteError) {
      console.error('❌ Error fetching Charlotte profiles:', charlotteError)
      return
    }

    console.log(`📊 Found ${charlotteProfiles?.length || 0} Charlotte profiles:`)
    charlotteProfiles?.forEach(profile => {
      console.log(`   ID: ${profile.id}`)
      console.log(`   Name: ${profile.name}`)
      console.log(`   Email: ${profile.email}`)
      console.log(`   Username: ${profile.username}`)
      console.log(`   Status: ${profile.status || 'active'}`)
      console.log(`   Created: ${profile.created_at}`)
      console.log(`   Updated: ${profile.updated_at}`)
      console.log('   ---')
    })

    // Check for recent child account creations (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recentChildAccounts, error: recentError } = await supabase
      .from('profiles')
      .select('*')
      .like('email', 'child-%@ganamos.app')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })

    if (recentError) {
      console.error('❌ Error fetching recent child accounts:', recentError)
    } else {
      console.log('')
      console.log(`🕐 Recent child accounts (last 10 minutes): ${recentChildAccounts?.length || 0}`)
      recentChildAccounts?.forEach(account => {
        console.log(`   ${account.name} (${account.email}) - Created: ${account.created_at}`)
      })
    }

    // Check Brian's connected accounts
    const { data: brianProfile, error: brianError } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('email', 'admin@example.com')
      .single()

    if (brianError) {
      console.error('❌ Error fetching Brian profile:', brianError)
      return
    }

    if (brianProfile) {
      console.log('')
      console.log(`👤 Brian's connected accounts:`)
      
      const { data: connections, error: connError } = await supabase
        .from('connected_accounts')
        .select(`
          *,
          connected_profile:connected_user_id(
            id, name, email, username, status
          )
        `)
        .eq('primary_user_id', brianProfile.id)
        .order('created_at', { ascending: false })

      if (connError) {
        console.error('❌ Error fetching connections:', connError)
      } else {
        console.log(`   Total connections: ${connections?.length || 0}`)
        connections?.forEach(conn => {
          const profile = conn.connected_profile
          if (profile) {
            console.log(`   - ${profile.name} (${profile.email}) - Status: ${profile.status || 'active'}`)
          }
        })
      }
    }

    // Check for any errors in the child account creation process
    console.log('')
    console.log('🔍 Checking for potential issues:')
    console.log('   1. RLS policies might be blocking child account creation')
    console.log('   2. Username generation might be failing')
    console.log('   3. Email generation might be failing')
    console.log('   4. Connection creation might be failing')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkCharlotteCreation()
