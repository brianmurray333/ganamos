import { sendEmail } from './email'
import { formatSatsValue } from './utils'
import { createServerSupabaseClient } from './supabase'

/**
 * Get the current Bitcoin price in USD from the database
 */
async function getBitcoinPriceUSD(): Promise<number | null> {
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
 */
async function convertSatsToUSD(amountSats: number): Promise<string> {
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
          color: #ffffff;
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
          <h1>Bitcoin Received</h1>
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
              <span class="detail-label">Amount: </span>
              <span class="detail-value">${formattedAmount} (${usdAmount})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date: </span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            ${fromName ? `
            <div class="detail-row">
              <span class="detail-label">From: </span>
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
    html
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
          color: #ffffff;
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
          <h1>Bitcoin Sent</h1>
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
              <span class="detail-label">Amount: </span>
              <span class="detail-value">${formattedAmount} (${usdAmount})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date: </span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            ${toName ? `
            <div class="detail-row">
              <span class="detail-label">To: </span>
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
    html
  )
}

/**
 * Send email notification when someone fixes an issue the user posted
 */
export async function sendIssueFixedEmail(params: {
  toEmail: string
  userName: string
  issueTitle: string
  fixerName: string
  rewardAmount: number
  date: Date
  postId: string
}) {
  const { toEmail, userName, issueTitle, fixerName, rewardAmount, date, postId } = params

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
          color: #ffffff;
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
          <h1>Issue Fixed!</h1>
        </div>
        <div class="content">
          <div class="greeting">
            Hello ${firstName},
          </div>
          <p>
            Great news! ${fixerName} submitted a fix for your issue.
          </p>
          <div class="issue-title">
            "${issueTitle}"
          </div>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Fixed By: </span>
              <span class="detail-value">${fixerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Reward Paid: </span>
              <span class="detail-value">${formattedReward} (${usdReward})</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date: </span>
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
    html
  )
}

