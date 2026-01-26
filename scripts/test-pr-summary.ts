/**
 * Test script for daily PR summary to Sphinx
 * Run with: npx tsx scripts/test-pr-summary.ts
 */

import { config } from 'dotenv'

// Load environment variables before importing modules that depend on them
config({ path: '.env.local' })

// Now import modules that depend on environment variables
import { sendPRSummaryToSphinx, getMergedPRs } from "../lib/daily-summary"

async function testPRSummary() {
  console.log('='.repeat(60))
  console.log('Testing Daily PR Summary to Sphinx')
  console.log('='.repeat(60))
  console.log()
  
  // Check environment variables
  console.log('Environment Check:')
  console.log('-'.repeat(60))
  console.log('SPHINX_ENABLED:', process.env.SPHINX_ENABLED)
  console.log('SPHINX_BOT_ID:', process.env.SPHINX_BOT_ID ? '✓ Set' : '✗ Not set')
  console.log('SPHINX_BOT_SECRET:', process.env.SPHINX_BOT_SECRET ? '✓ Set' : '✗ Not set')
  console.log('SPHINX_CHAT_PUBKEY:', process.env.SPHINX_CHAT_PUBKEY ? '✓ Set' : '✗ Not set')
  console.log('GITHUB_TOKEN:', process.env.GITHUB_TOKEN ? '✓ Set' : '✗ Not set')
  console.log('GITHUB_REPO:', process.env.GITHUB_REPO || 'brianmurray333/ganamos (default)')
  console.log()
  
  // First, check what PRs would be sent
  console.log('Step 1: Fetching merged PRs from last 24 hours')
  console.log('-'.repeat(60))
  try {
    const prData = await getMergedPRs()
    console.log(`Found ${prData.count} merged PR(s)`)
    
    if (prData.prs.length > 0) {
      prData.prs.forEach((pr, index) => {
        console.log(`  ${index + 1}. #${pr.number}: ${pr.title}`)
        console.log(`     ${pr.url}`)
        console.log(`     Merged: ${new Date(pr.mergedAt).toLocaleString()}`)
      })
    } else {
      console.log('  No PRs merged in the last 24 hours')
    }
    console.log()
  } catch (error) {
    console.error('✗ Error fetching PRs:', error)
    console.log()
  }
  
  // Now test sending to Sphinx
  console.log('Step 2: Sending PR summary to Sphinx')
  console.log('-'.repeat(60))
  try {
    console.log('Calling sendPRSummaryToSphinx()...')
    const result = await sendPRSummaryToSphinx()
    
    if (result.success) {
      console.log('✓ PR summary sent to Sphinx successfully!')
      console.log('  PRs included:', result.prCount)
      console.log('  Sphinx response:', JSON.stringify(result.result, null, 2))
    } else {
      console.log('✗ Failed to send PR summary to Sphinx')
      console.log('  Error:', result.error)
    }
    
  } catch (error) {
    console.error('✗ Exception occurred:', error)
    if (error instanceof Error) {
      console.error('  Stack:', error.stack)
    }
  }
  
  console.log()
  console.log('='.repeat(60))
  console.log('Test Complete')
  console.log('='.repeat(60))
}

// Run the test
testPRSummary().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
