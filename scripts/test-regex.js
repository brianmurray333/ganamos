// Test regex parsing
const memo1 = 'Transfer from @Brian'
const memo2 = 'Transfer to @kit'

console.log('Testing regex parsing...')
console.log('')

console.log('Memo 1:', memo1)
const match1 = memo1.match(/Transfer from @([^:]+)/)
console.log('Match 1:', match1)
console.log('Sender:', match1?.[1]?.trim())

console.log('')
console.log('Memo 2:', memo2)
const match2 = memo2.match(/Transfer to @([^:]+)/)
console.log('Match 2:', match2)
console.log('Recipient:', match2?.[1]?.trim())

console.log('')
console.log('Expected results:')
console.log('- Kit should see: "You received 3k sats from @Brian"')
console.log('- Brian should see: "You sent 3k sats to @kit"')
