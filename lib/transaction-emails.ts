import { sendEmail } from './email'
import { formatSatsValue } from './utils'
import { createServerSupabaseClient } from './supabase'

/**
 * Get the current Bitcoin price in USD from the database
 * Exported for testing purposes
 */
export async function getBitcoinPriceUSD(): Promise<number | null> {
  try {
    const supabase = createServerSupabaseClient()
    
    // Get the latest Bitcoin price from database
    const { data, error } = await supabase
      .from('bitcoin_prices')
      .select('price')
      .eq('currency', 'USD')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error || !data) {
      console.error('Error fetching Bitcoin price:', error)
      return null
    }
    
    return parseFloat(data.price)
  } catch (error) {
    console.error('Error getting Bitcoin price:', error)
    return null
  }
}

/**
 * Convert satoshis to USD
 * Exported for testing purposes
 */
export async function convertSatsToUSD(amountSats: number): Promise<string> {
  const btcPrice = await getBitcoinPriceUSD()
  
  if (!btcPrice) {
    return 'USD price unavailable'
  }
  
  const btcAmount = amountSats / 100000000
  const usdAmount = btcAmount * btcPrice
  
  // Format USD amount with 2 decimal places
  return `$${usdAmount.toFixed(2)}`
}

/**
 * Send email notification when user receives Bitcoin
 */
export async function sendBitcoinReceivedEmail(params: {
  toEmail: string
  userName: string
  amountSats: number
  fromName?: string
  date: Date
  transactionType: 'deposit' | 'internal'
}) {
  const { toEmail, userName, amountSats, fromName, date, transactionType } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Format amount
  const formattedAmount = formatSatsValue(amountSats)
  const usdAmount = await convertSatsToUSD(amountSats)

  // Get first name only
  const firstName = userName.split(' ')[0]

  // Determine the source text
  const sourceText = transactionType === 'internal' && fromName 
    ? `from ${fromName}` 
    : 'via Lightning'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">Bitcoin Received</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            You received Bitcoin ${sourceText}.
          </p>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Amount:&nbsp;</span>
              <span class="detail-value">${formattedAmount} (${usdAmount})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            ${fromName ? `
            <div class="detail-row">
              <span class="detail-label">From:&nbsp;</span>
              <span class="detail-value">${fromName}</span>
            </div>
            ` : ''}
          </div>
          <center>
            <a href="https://www.ganamos.earth/wallet" class="cta-button">View Wallet</a>
          </center>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Bitcoin Received - ${formattedAmount}`,
    html,
    {
      type: transactionType === 'internal' ? 'transfer_received' : 'deposit',
      metadata: {
        amountSats,
        amountUsd: usdAmount,
        userName,
        fromName,
        transactionType,
        date,
      }
    }
  )
}

/**
 * Send email notification when user sends Bitcoin
 */
export async function sendBitcoinSentEmail(params: {
  toEmail: string
  userName: string
  amountSats: number
  toName?: string
  date: Date
  transactionType: 'withdrawal' | 'internal'
}) {
  const { toEmail, userName, amountSats, toName, date, transactionType } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Format amount
  const formattedAmount = formatSatsValue(amountSats)
  const usdAmount = await convertSatsToUSD(amountSats)

  // Get first name only
  const firstName = userName.split(' ')[0]

  // Determine the destination text
  const destinationText = transactionType === 'internal' && toName 
    ? `to ${toName}` 
    : 'via Lightning'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">Bitcoin Sent</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            You sent Bitcoin ${destinationText}.
          </p>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Amount:&nbsp;</span>
              <span class="detail-value">${formattedAmount} (${usdAmount})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            ${toName ? `
            <div class="detail-row">
              <span class="detail-label">To:&nbsp;</span>
              <span class="detail-value">${toName}</span>
            </div>
            ` : ''}
          </div>
          <center>
            <a href="https://www.ganamos.earth/wallet" class="cta-button">View Wallet</a>
          </center>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Bitcoin Sent - ${formattedAmount}`,
    html,
    {
      type: transactionType === 'internal' ? 'transfer_sent' : 'withdrawal',
      metadata: {
        amountSats,
        amountUsd: usdAmount,
        userName,
        toName,
        transactionType,
        date,
      }
    }
  )
}

/**
 * Send email notification when someone fixes an issue the user posted
 * @param isPostOwnerAssigning - If true, the post owner marked the issue complete and assigned a fixer
 *                               If false (default), the fixer submitted a fix themselves
 */
export async function sendIssueFixedEmail(params: {
  toEmail: string
  userName: string
  issueTitle: string
  fixerName: string
  rewardAmount: number
  date: Date
  postId: string
  isPostOwnerAssigning?: boolean
}) {
  const { toEmail, userName, issueTitle, fixerName, rewardAmount, date, postId, isPostOwnerAssigning = false } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Format reward
  const formattedReward = formatSatsValue(rewardAmount)
  const usdReward = await convertSatsToUSD(rewardAmount)

  // Get first name only
  const firstName = userName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        p {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .issue-title {
          background-color: #f9fafb;
          border-left: 4px solid #16a349;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">Issue Fixed</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            Great news! ${isPostOwnerAssigning ? `You marked your issue as fixed and assigned ${fixerName} as the fixer.` : `${fixerName} submitted a fix for your issue.`}
          </p>
          <div class="issue-title">
            "${issueTitle}"
          </div>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Fixed By:&nbsp;</span>
              <span class="detail-value">${fixerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Reward Paid:&nbsp;</span>
              <span class="detail-value">${formattedReward} (${usdReward})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
          </div>
          <center>
            <a href="https://www.ganamos.earth/post/${postId}" class="cta-button">View Issue</a>
          </center>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Issue Fixed: ${issueTitle}`,
    html,
    {
      type: 'issue_fixed',
      metadata: {
        userName,
        issueTitle,
        fixerName,
        reward: rewardAmount,
        postId,
        date,
      }
    }
  )
}

/**
 * Send email notification to a fixer when they earn a reward
 * This is sent both when they submit a fix themselves and when assigned by the poster
 */
export async function sendRewardEarnedEmail(params: {
  toEmail: string
  fixerName: string
  issueTitle: string
  posterName: string
  rewardAmount: number
  date: Date
  postId: string
}) {
  const { toEmail, fixerName, issueTitle, posterName, rewardAmount, date, postId } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Format reward
  const formattedReward = formatSatsValue(rewardAmount)
  const usdReward = await convertSatsToUSD(rewardAmount)

  // Get first name only
  const firstName = fixerName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        p {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .issue-title {
          background-color: #f9fafb;
          border-left: 4px solid #16a349;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">You Earned a Reward!</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            Great news! You earned a reward for fixing an issue posted by ${posterName}.
          </p>
          <div class="issue-title">
            "${issueTitle}"
          </div>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Reward Earned:&nbsp;</span>
              <span class="detail-value">${formattedReward} (${usdReward})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Posted By:&nbsp;</span>
              <span class="detail-value">${posterName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
          </div>
          <center>
            <a href="https://www.ganamos.earth/post/${postId}" class="cta-button">View Issue</a>
          </center>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `You Earned ${formattedReward}!`,
    html,
    {
      type: 'reward_earned',
      metadata: {
        fixerName,
        issueTitle,
        posterName,
        reward: rewardAmount,
        postId,
        date,
      }
    }
  )
}

/**
 * Send email notification when someone submits a fix for review
 */
export async function sendFixSubmittedForReviewEmail(params: {
  toEmail: string
  userName: string
  issueTitle: string
  fixerName: string
  date: Date
  postId: string
  aiAnalysis?: string | null
  beforeImageUrl?: string | null
  afterImageUrl?: string | null
}) {
  const { toEmail, userName, issueTitle, fixerName, date, postId, aiAnalysis, beforeImageUrl, afterImageUrl } = params
  
  // Build the review URL with review flag to trigger the review flow
  // Note: This is different from ?verify=true which opens the "Close Issue" dialog
  const reviewUrl = `https://www.ganamos.earth/post/${postId}?review=true`

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Get first name only
  const firstName = userName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .issue-title {
          background-color: #f9fafb;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #10b981;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">Fix Submitted for Review</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            ${fixerName} has submitted a fix for your issue and it's awaiting your review.
          </p>
          <div class="issue-title">
            "${issueTitle}"
          </div>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Submitted By:&nbsp;</span>
              <span class="detail-value">${fixerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
          </div>
          ${aiAnalysis ? `
          <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 6px;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #1e40af;">AI Review</h3>
            <p style="margin: 0; font-size: 14px; color: #1e3a8a; line-height: 1.6;">${aiAnalysis}</p>
          </div>
          ` : ''}
          ${beforeImageUrl && afterImageUrl ? `
          <div style="margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">Before & After</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; padding-right: 8px; vertical-align: top;">
                  <div style="background-color: #4b5563; border-radius: 8px; padding: 8px 8px 4px 8px;">
                    <img src="${beforeImageUrl}" alt="Before" style="width: 100%; height: auto; border-radius: 4px; display: block;" />
                    <div style="color: white; padding: 6px 0 2px 0; font-size: 13px; font-weight: 600; text-align: center;">Before</div>
                  </div>
                </td>
                <td style="width: 50%; padding-left: 8px; vertical-align: top;">
                  <div style="background-color: #4b5563; border-radius: 8px; padding: 8px 8px 4px 8px;">
                    <img src="${afterImageUrl}" alt="After" style="width: 100%; height: auto; border-radius: 4px; display: block;" />
                    <div style="color: white; padding: 6px 0 2px 0; font-size: 13px; font-weight: 600; text-align: center;">After</div>
                  </div>
                </td>
              </tr>
            </table>
          </div>
          ` : ''}
          <center>
            <a href="${reviewUrl}" class="cta-button">Review Fix</a>
          </center>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Fix submitted for: ${issueTitle}`,
    html,
    {
      type: 'fix_submitted',
      metadata: {
        userName,
        issueTitle,
        fixerName,
        postId,
        date,
      }
    }
  )
}

/**
 * Send email notification when someone marks a job complete from their SatoshiPet device
 * This lets the poster verify and reward the fixer with one tap
 */
export async function sendDeviceJobCompletionEmail(params: {
  toEmail: string
  ownerName: string
  issueTitle: string
  fixerName: string
  fixerUsername: string
  fixerUserId: string
  rewardAmount: number
  date: Date
  postId: string
}) {
  const { toEmail, ownerName, issueTitle, fixerName, fixerUsername, fixerUserId, rewardAmount, date, postId } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Get first name only
  const firstName = ownerName.split(' ')[0]

  // Build verify URL with query params to pre-load the modal
  const verifyUrl = `https://www.ganamos.earth/post/${postId}?verify=true&fixer=${encodeURIComponent(fixerUsername)}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .issue-title {
          background-color: #f9fafb;
          border-left: 4px solid #16a349;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 32px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .reward-highlight {
          background-color: #ecfdf5;
          border: 2px solid #16a349;
          border-radius: 8px;
          padding: 15px;
          text-align: center;
          margin: 20px 0;
        }
        .reward-amount {
          font-size: 24px;
          font-weight: 700;
          color: #138a3d;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important; -webkit-text-fill-color: #ffffff !important;">Fix Submitted</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            <strong>${fixerName}</strong> says they completed your task:
          </p>
          <div class="issue-title">
            "${issueTitle}"
          </div>
          <div class="reward-highlight">
            <div class="reward-amount">${rewardAmount.toLocaleString()} sats</div>
            <div style="color: #6b7280; font-size: 14px; margin-top: 4px;">Ready to send when verified</div>
          </div>
          <center>
            <a href="${verifyUrl}" class="cta-button">Review Fix</a>
          </center>
          <div class="details" style="margin-top: 16px;">
            <div class="detail-row">
              <span class="detail-label">Completed By:&nbsp;</span>
              <span class="detail-value">@${fixerUsername}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Fix submitted: ${issueTitle.substring(0, 50)}`,
    html,
    {
      type: 'device_job_completion',
      metadata: {
        ownerName,
        issueTitle,
        fixerName,
        fixerUsername,
        fixerUserId,
        rewardAmount,
        postId,
        date,
      }
    }
  )
}

/**
 * Send email notification to group admin when someone requests to join
 */
export async function sendGroupJoinRequestEmail(params: {
  toEmail: string
  adminName: string
  requesterName: string
  groupName: string
  groupId: string
  date: Date
}) {
  const { toEmail, adminName, requesterName, groupName, groupId, date } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Get first name only
  const firstName = adminName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .group-name {
          background-color: #f9fafb;
          border-left: 4px solid #16a349;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .details {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
          gap: 16px;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
          flex-shrink: 0;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 6px;
          font-weight: 600;
          margin: 20px 0;
        }
        a.cta-button {
          color: #ffffff !important;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">New Join Request</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            <strong>${requesterName}</strong> has requested to join your group.
          </p>
          <div class="group-name">
            ${groupName}
          </div>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Requested By:&nbsp;</span>
              <span class="detail-value">${requesterName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:&nbsp;</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
          </div>
          <center>
            <a href="https://www.ganamos.earth/groups/${groupId}" class="cta-button">Review Request</a>
          </center>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `New join request for ${groupName}`,
    html,
    {
      type: 'group_join_request',
      metadata: {
        adminName,
        requesterName,
        groupName,
        groupId,
        date,
      }
    }
  )
}

/**
 * Send email confirmation to user when they request to join a group
 */
export async function sendGroupJoinRequestConfirmationEmail(params: {
  toEmail: string
  requesterName: string
  groupName: string
  date: Date
}) {
  const { toEmail, requesterName, groupName, date } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Get first name only
  const firstName = requesterName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #16a349 0%, #138a3d 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .group-name {
          background-color: #f9fafb;
          border-left: 4px solid #16a349;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .pending-badge {
          display: inline-block;
          background-color: #fef3c7;
          color: #92400e;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 500;
          margin-left: 8px;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
        }
        .footer a {
          color: #16a349;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #ffffff !important;">Join Request Sent</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            Your request to join the group has been submitted successfully.
          </p>
          <div class="group-name">
            ${groupName} <span class="pending-badge">Pending</span>
          </div>
          <p>
            A group admin will review your request and you'll be notified once it's approved.
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Request submitted: ${formattedDate}
          </p>
        </div>
        <div class="footer">
          <p>
            This is an automated notification from <a href="https://www.ganamos.earth">Ganamos</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Your request to join ${groupName} has been submitted`,
    html,
    {
      type: 'group_join_request_confirmation',
      metadata: {
        requesterName,
        groupName,
        date,
      }
    }
  )
}

/**
 * Send email notification to the post owner when a group admin closes their issue
 * This is a security/transparency measure to inform the owner about actions taken on their behalf
 */
export async function sendGroupAdminClosedIssueEmail(params: {
  toEmail: string
  postOwnerName: string
  adminName: string
  issueTitle: string
  fixerName: string
  rewardAmount: number
  groupName: string
  date: Date
  postId: string
}) {
  const { toEmail, postOwnerName, adminName, issueTitle, fixerName, rewardAmount, groupName, date, postId } = params

  // Format date
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  })

  // Format reward
  const formattedReward = formatSatsValue(rewardAmount)
  const usdReward = await convertSatsToUSD(rewardAmount)

  // Get first name only
  const firstName = postOwnerName.split(' ')[0]

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff !important;
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        p {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .issue-title {
          background-color: #f9fafb;
          border-left: 4px solid #3b82f6;
          padding: 15px;
          margin: 20px 0;
          font-weight: 600;
        }
        .info-box {
          background-color: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .info-row:last-child {
          border-bottom: none;
        }
        .info-label {
          color: #6b7280;
          font-size: 14px;
        }
        .info-value {
          font-weight: 600;
          font-size: 14px;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
        }
        .footer {
          background-color: #f9fafb;
          padding: 20px;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
        }
        .note {
          background-color: #fefce8;
          border: 1px solid #fef08a;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 Issue Closed by Admin</h1>
        </div>
        <div class="content">
          <p class="greeting">Hi ${firstName},</p>
          <p>A group admin has closed an issue you posted:</p>
          <div class="issue-title">"${issueTitle}"</div>
          
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Closed by</span>
              <span class="info-value">${adminName} (Group Admin)</span>
            </div>
            <div class="info-row">
              <span class="info-label">Group</span>
              <span class="info-value">${groupName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Reward sent to</span>
              <span class="info-value">@${fixerName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Reward amount</span>
              <span class="info-value">${formattedReward} (~${usdReward})</span>
            </div>
            <div class="info-row">
              <span class="info-label">Date</span>
              <span class="info-value">${formattedDate}</span>
            </div>
          </div>
          
          <div class="note">
            <strong>📋 Why am I getting this?</strong><br>
            Group admins in ${groupName} have permission to close issues and distribute rewards. This notification is sent for your awareness.
          </div>
          
          <center>
            <a href="${process.env.NEXT_PUBLIC_URL || 'https://www.ganamos.earth'}/post/${postId}" class="button">View Issue</a>
          </center>
        </div>
        <div class="footer">
          <p>If you have questions about this action, please contact your group admin.</p>
          <p style="margin-bottom: 0;">Ganamos Earth</p>
        </div>
      </div>
    </body>
    </html>
  `

  return await sendEmail(
    toEmail,
    `Issue closed by ${adminName}: "${issueTitle}"`,
    html,
    {
      type: 'group_admin_closed_issue',
      metadata: {
        postOwnerName,
        adminName,
        issueTitle,
        fixerName,
        rewardAmount,
        groupName,
        date,
        postId,
      }
    }
  )
}