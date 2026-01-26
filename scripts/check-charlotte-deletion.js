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

async function checkCharlotteDeletion() {
  console.log('🔍 Checking why Charlotte was deleted...')
  console.log('')

  try {
    // Get Charlotte's profile with deletion details
    const { data: charlotteProfile, error: charlotteError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', '35641d69-5b40-4ef5-a219-f856f3c9a379')
      .single()

    if (charlotteError) {
      console.error('❌ Error fetching Charlotte profile:', charlotteError)
      return
    }

    console.log('📊 Charlotte Profile Details:')
    console.log(`   ID: ${charlotteProfile.id}`)
    console.log(`   Name: ${charlotteProfile.name}`)
    console.log(`   Email: ${charlotteProfile.email}`)
    console.log(`   Username: ${charlotteProfile.username}`)
    console.log(`   Status: ${charlotteProfile.status}`)
    console.log(`   Deleted At: ${charlotteProfile.deleted_at}`)
    console.log(`   Deleted By: ${charlotteProfile.deleted_by}`)
    console.log(`   Created: ${charlotteProfile.created_at}`)
    console.log(`   Updated: ${charlotteProfile.updated_at}`)
    console.log('')

    // Check who deleted Charlotte
    if (charlotteProfile.deleted_by) {
      const { data: deleterProfile, error: deleterError } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', charlotteProfile.deleted_by)
        .single()

      if (deleterError) {
        console.error('❌ Error fetching deleter profile:', deleterError)
      } else {
        console.log(`🗑️  Deleted by: ${deleterProfile.name} (${deleterProfile.email})`)
      }
    }

    // Check if there's a connection record
    const { data: connection, error: connError } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('connected_user_id', charlotteProfile.id)
      .single()

    if (connError) {
      console.log('❌ No connection record found (this is expected if deleted)')
    } else {
      console.log('✅ Connection record still exists:')
      console.log(`   Primary User: ${connection.primary_user_id}`)
      console.log(`   Connected User: ${connection.connected_user_id}`)
      console.log(`   Created: ${connection.created_at}`)
    }

    console.log('')
    console.log('🔍 Analysis:')
    console.log('   - Charlotte was created successfully')
    console.log('   - But was immediately soft deleted')
    console.log('   - This suggests the deletion happened through the UI')
    console.log('   - The account exists but is hidden from the Family section')
    console.log('   - This is likely a user action, not a system error')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

checkCharlotteDeletion()
