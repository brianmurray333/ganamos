const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SECRET_API_KEY (or SUPABASE_SECRET_API_KEY as fallback)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function generateUsername(name, email) {
  // If we have a name, use it to generate username
  if (name && name.trim()) {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 20)
  }
  
  // If no name, use email prefix
  if (email && email.includes('@')) {
    const emailPrefix = email.split('@')[0]
    return emailPrefix
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 20)
  }
  
  // Fallback to a generic username
  return 'user'
}

async function generateUniqueUsername(baseUsername, userId, supabaseClient) {
  let finalUsername = baseUsername
  let counter = 1
  const maxAttempts = 100
  
  // Check if base username is available
  while (counter <= maxAttempts) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('username', finalUsername)
      .maybeSingle()
    
    if (error) {
      console.error(`⚠️  Error checking username availability: ${error.message}`)
      // On error, fall back to UUID-based username to ensure uniqueness
      return `user-${userId.substring(0, 8)}`
    }
    
    // If no existing user found, username is available
    if (!data) {
      return finalUsername
    }
    
    // Username exists, try with counter
    finalUsername = `${baseUsername}-${counter}`
    counter++
  }
  
  // If we exhausted all attempts, fall back to UUID-based username
  console.warn(`⚠️  Could not find unique username after ${maxAttempts} attempts, using UUID fallback`)
  return `user-${userId.substring(0, 8)}`
}

async function addDefaultUsernames() {
  console.log('👤 Adding default usernames to users without usernames...')
  console.log('')

  try {
    // Get all profiles that don't have usernames
    const { data: profiles, error: fetchError } = await supabase
      .from('profiles')
      .select('id, name, email, username')
      .is('username', null)

    if (fetchError) {
      console.error('❌ Error fetching profiles:', fetchError)
      return
    }

    if (!profiles || profiles.length === 0) {
      console.log('✅ All users already have usernames!')
      return
    }

    console.log(`📊 Found ${profiles.length} users without usernames:`)
    profiles.forEach(profile => {
      console.log(`   - ${profile.name || 'No name'} (${profile.email})`)
    })
    console.log('')

    // Update each profile with a default username
    let updatedCount = 0
    for (const profile of profiles) {
      const baseUsername = generateUsername(profile.name, profile.email)
      const uniqueUsername = await generateUniqueUsername(baseUsername, profile.id, supabase)
      
      console.log(`🔄 Updating ${profile.name || profile.email}: ${uniqueUsername}`)
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          username: uniqueUsername,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) {
        console.error(`❌ Error updating ${profile.name || profile.email}:`, updateError)
      } else {
        console.log(`✅ Updated ${profile.name || profile.email} → @${uniqueUsername}`)
        updatedCount++
      }
    }

    console.log('')
    console.log('🎉 USERNAME UPDATE COMPLETE!')
    console.log('============================')
    console.log(`✅ Updated ${updatedCount} out of ${profiles.length} users`)
    console.log('✅ All users now have usernames')
    console.log('')
    console.log('💡 Next steps:')
    console.log('   - Try sending sats to Charlotte again')
    console.log('   - Her username should now display properly')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

addDefaultUsernames()
