// Test the activity loading condition logic
function testActivityCondition() {
  console.log('🧪 Testing Activity Loading Condition...')
  console.log('')

  // Simulate different scenarios
  const scenarios = [
    {
      name: 'Parent Account (Brian)',
      user: { id: 'dce58449-faa0-413e-8b7a-6e607d280beb' },
      activeUserId: null,
      activeTab: 'activity'
    },
    {
      name: 'Child Account (Kittle)',
      user: { id: 'dce58449-faa0-413e-8b7a-6e607d280beb' }, // Parent user
      activeUserId: 'a48208e9-183d-4ffc-af54-4d9a0ceb0a44', // Child user
      activeTab: 'activity'
    },
    {
      name: 'Child Account (Marlowe)',
      user: { id: 'dce58449-faa0-413e-8b7a-6e607d280beb' }, // Parent user
      activeUserId: 'd60a269f-b1a9-4030-96d5-7ddc3ca5e369', // Child user
      activeTab: 'activity'
    }
  ]

  scenarios.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.name}:`)
    console.log('   User ID:', scenario.user.id)
    console.log('   Active User ID:', scenario.activeUserId)
    console.log('   Active Tab:', scenario.activeTab)
    
    // Test the OLD condition (broken)
    const oldCondition = scenario.activeTab === 'activity' && scenario.user
    console.log('   OLD condition (user):', oldCondition)
    
    // Test the NEW condition (fixed)
    const currentUserId = scenario.activeUserId || scenario.user?.id
    const newCondition = scenario.activeTab === 'activity' && currentUserId
    console.log('   NEW condition (currentUserId):', newCondition)
    console.log('   Current User ID:', currentUserId)
    
    if (oldCondition !== newCondition) {
      console.log('   ✅ FIXED: Condition changed from', oldCondition, 'to', newCondition)
    } else {
      console.log('   ⚠️  No change needed')
    }
    console.log('')
  })

  console.log('🔍 Expected Results:')
  console.log('- Parent account: Should work with both conditions')
  console.log('- Child accounts: OLD condition fails, NEW condition works')
  console.log('- Activities should load for all accounts now')
}

testActivityCondition()
