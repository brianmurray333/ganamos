// Test the activity parsing logic
function testActivityParsing() {
  console.log('🧪 Testing Activity Parsing Logic...')
  console.log('')

  // Test data from the database
  const kitActivity = {
    type: 'internal',
    metadata: {
      memo: 'Transfer from @Brian',
      amount: 3000
    }
  }

  const brianActivity = {
    type: 'internal', 
    metadata: {
      memo: 'Transfer to @kit',
      amount: -3000
    }
  }

  console.log('📊 Kit\'s Activity (Receive):')
  console.log('============================')
  console.log('Memo:', kitActivity.metadata.memo)
  console.log('Amount:', kitActivity.metadata.amount)
  
  // Test the parsing logic
  const amount = kitActivity.metadata.amount
  const memo = kitActivity.metadata.memo || ""
  
  if (amount && amount > 0) {
    const sender = memo.includes("Transfer from @") 
      ? memo.match(/Transfer from @([^:]+)/)?.[1]?.trim()
      : "someone"
    console.log('Parsed sender:', sender)
    console.log('Expected: "You received 3k sats from @Brian"')
    console.log('Actual: "You received 3k sats from @" + sender')
  }

  console.log('')
  console.log('📊 Brian\'s Activity (Send):')
  console.log('===========================')
  console.log('Memo:', brianActivity.metadata.memo)
  console.log('Amount:', brianActivity.metadata.amount)
  
  const brianAmount = brianActivity.metadata.amount
  const brianMemo = brianActivity.metadata.memo || ""
  
  if (brianAmount && brianAmount < 0) {
    const recipient = brianMemo.includes("Transfer to @") 
      ? brianMemo.match(/Transfer to @([^:]+)/)?.[1]?.trim()
      : "someone"
    console.log('Parsed recipient:', recipient)
    console.log('Expected: "You sent 3k sats to @kit"')
    console.log('Actual: "You sent 3k sats to @" + recipient)
  }

  console.log('')
  console.log('✅ Parsing test completed!')
}

testActivityParsing()
