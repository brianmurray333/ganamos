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

async function restoreCharlotte() {
  console.log('🔄 Restoring Charlotte\'s account...')
  console.log('')

  try {
    // Restore Charlotte's account by setting status to active
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        status: 'active',
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', '35641d69-5b40-4ef5-a219-f856f3c9a379')

    if (updateError) {
      console.error('❌ Error restoring Charlotte:', updateError)
      return
    }

    console.log('✅ Charlotte\'s account restored successfully!')
    console.log('   - Status changed from "deleted" to "active"')
    console.log('   - Deleted timestamp cleared')
    console.log('   - Deleted by cleared')
    console.log('   - Account should now appear in Family section')

    // Verify the restoration
    const { data: charlotteProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('id, name, email, status, deleted_at, deleted_by')
      .eq('id', '35641d69-5b40-4ef5-a219-f856f3c9a379')
      .single()

    if (verifyError) {
      console.error('❌ Error verifying restoration:', verifyError)
    } else {
      console.log('')
      console.log('📊 Verification:')
      console.log(`   Name: ${charlotteProfile.name}`)
      console.log(`   Email: ${charlotteProfile.email}`)
      console.log(`   Status: ${charlotteProfile.status}`)
      console.log(`   Deleted At: ${charlotteProfile.deleted_at}`)
      console.log(`   Deleted By: ${charlotteProfile.deleted_by}`)
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

restoreCharlotte()
