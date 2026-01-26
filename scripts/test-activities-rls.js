const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const adminSupabase = createClient(supabaseUrl, supabaseKey)
const anonSupabase = createClient(supabaseUrl, supabaseAnonKey)

async function testActivitiesRLS() {
  console.log('🔍 Testing Activities RLS...')
  console.log('')

  const kittleId = 'a48208e9-183d-4ffc-af54-4d9a0ceb0a44'

  try {
    // Test with admin client (bypasses RLS)
    console.log('1️⃣ Testing with ADMIN client (bypasses RLS):')
    console.log('==========================================')
    const { data: adminData, error: adminError, count: adminCount } = await adminSupabase
      .from('activities')
      .select('*', { count: 'exact' })
      .eq('user_id', kittleId)
      .range(0, 9)

    if (adminError) {
      console.error('❌ Admin query error:', adminError)
    } else {
      console.log('✅ Admin query success!')
      console.log('   Found:', adminData.length, 'activities')
      console.log('   Total count:', adminCount)
    }

    console.log('')
    console.log('2️⃣ Testing with ANON client (subject to RLS):')
    console.log('============================================')
    const { data: anonData, error: anonError, count: anonCount } = await anonSupabase
      .from('activities')
      .select('*', { count: 'exact' })
      .eq('user_id', kittleId)
      .range(0, 9)

    if (anonError) {
      console.error('❌ Anon query error:', anonError)
    } else {
      console.log('✅ Anon query success!')
      console.log('   Found:', anonData.length, 'activities')
      console.log('   Total count:', anonCount)
    }

    console.log('')
    console.log('🔍 Analysis:')
    console.log('===========')
    if (adminData.length > 0 && anonData.length === 0) {
      console.log('❌ RLS POLICY ISSUE DETECTED!')
      console.log('   - Admin can see activities ✅')
      console.log('   - Anon/client cannot see activities ❌')
      console.log('   - This explains why the browser shows "No activity yet"')
      console.log('')
      console.log('💡 Solution: Fix the RLS policy on the activities table')
      console.log('   The policy should allow users to read their own activities')
    } else if (adminData.length === 0) {
      console.log('❌ No activities found in database!')
    } else {
      console.log('✅ RLS policy is working correctly')
    }

  } catch (error) {
    console.error('❌ Error testing RLS:', error)
  }
}

testActivitiesRLS()
