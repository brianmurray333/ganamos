import { sendEmail } from './email'
import { formatSatsValue } from './utils'
import { createServerSupabaseClient } from './supabase'
import { renderEmail, escapeHtml, EMAIL_BASE_URL } from './email-layout'

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
    ? `from ${escapeHtml(fromName)}` 
    : 'via Lightning'

  const details: Array<[string, string]> = [
    ['Amount', `${formattedAmount} (${usdAmount})`],
    ['Date', formattedDate],
  ]
  if (fromName) details.push(['From', escapeHtml(fromName)])

  const html = renderEmail({
    title: 'Bitcoin Received',
    preheader: `You received ${formattedAmount} ${transactionType === 'internal' && fromName ? `from ${fromName}` : 'via Lightning'}.`,
    greeting: escapeHtml(firstName),
    paragraphs: [`You received Bitcoin ${sourceText}.`],
    details,
    button: { label: 'View Wallet', href: `${EMAIL_BASE_URL}/wallet` },
  })

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
    ? `to ${escapeHtml(toName)}` 
    : 'via Lightning'

  const details: Array<[string, string]> = [
    ['Amount', `${formattedAmount} (${usdAmount})`],
    ['Date', formattedDate],
  ]
  if (toName) details.push(['To', escapeHtml(toName)])

  const html = renderEmail({
    title: 'Bitcoin Sent',
    preheader: `You sent ${formattedAmount} ${transactionType === 'internal' && toName ? `to ${toName}` : 'via Lightning'}.`,
    greeting: escapeHtml(firstName),
    paragraphs: [`You sent Bitcoin ${destinationText}.`],
    details,
    button: { label: 'View Wallet', href: `${EMAIL_BASE_URL}/wallet` },
  })

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

  const safeFixerName = escapeHtml(fixerName)

  const html = renderEmail({
    title: 'Issue Fixed',
    preheader: `${fixerName} fixed "${issueTitle}" and earned ${formattedReward}.`,
    greeting: escapeHtml(firstName),
    paragraphs: [
      `Great news! ${isPostOwnerAssigning ? `You marked your issue as fixed and assigned ${safeFixerName} as the fixer.` : `${safeFixerName} submitted a fix for your issue.`}`,
      `<strong>"${escapeHtml(issueTitle)}"</strong>`,
    ],
    details: [
      ['Fixed By', safeFixerName],
      ['Reward Paid', `${formattedReward} (${usdReward})`],
      ['Date', formattedDate],
    ],
    button: { label: 'View Issue', href: `${EMAIL_BASE_URL}/post/${postId}` },
  })

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

  const safePosterName = escapeHtml(posterName)

  const html = renderEmail({
    title: 'You Earned a Reward!',
    preheader: `You earned ${formattedReward} for fixing "${issueTitle}".`,
    greeting: escapeHtml(firstName),
    paragraphs: [
      `Great news! You earned a reward for fixing an issue posted by ${safePosterName}.`,
      `<strong>"${escapeHtml(issueTitle)}"</strong>`,
    ],
    details: [
      ['Reward Earned', `${formattedReward} (${usdReward})`],
      ['Posted By', safePosterName],
      ['Date', formattedDate],
    ],
    button: { label: 'View Issue', href: `${EMAIL_BASE_URL}/post/${postId}` },
  })

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
  proofOfCompletionText?: string | null
  fixerNote?: string | null
}) {
  const { toEmail, userName, issueTitle, fixerName, date, postId, aiAnalysis, beforeImageUrl, afterImageUrl, proofOfCompletionText, fixerNote } = params
  
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

  const safeFixerName = escapeHtml(fixerName)
  const hasBeforeAfter = Boolean(beforeImageUrl && afterImageUrl)

  const paragraphs = [
    `${safeFixerName} has submitted a fix for your issue and it's awaiting your review.`,
    `<strong>"${escapeHtml(issueTitle)}"</strong>`,
  ]
  if (proofOfCompletionText) {
    paragraphs.push(
      `<strong>Proof of completion:</strong><br><span style="white-space:pre-line;">${escapeHtml(proofOfCompletionText)}</span>`
    )
  }
  if (fixerNote) {
    paragraphs.push(
      `<strong>Fixer's note:</strong><br><span style="white-space:pre-line;">${escapeHtml(fixerNote)}</span>`
    )
  }

  const html = renderEmail({
    title: 'Fix Submitted for Review',
    preheader: `${fixerName} submitted a fix for "${issueTitle}". It's awaiting your review.`,
    greeting: escapeHtml(firstName),
    paragraphs,
    details: [
      ['Submitted By', safeFixerName],
      ['Date', formattedDate],
    ],
    callout: aiAnalysis
      ? { tone: 'info', title: 'AI Review', html: escapeHtml(aiAnalysis) }
      : undefined,
    imagePair: hasBeforeAfter
      ? [
          { src: escapeHtml(beforeImageUrl), alt: 'Before', label: 'Before' },
          { src: escapeHtml(afterImageUrl), alt: 'After', label: 'After' },
        ]
      : undefined,
    button: { label: 'Review Fix', href: reviewUrl },
  })

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

  const html = renderEmail({
    title: 'Fix Submitted',
    preheader: `${fixerName} says they completed "${issueTitle}". Review the fix to send ${rewardAmount.toLocaleString()} sats.`,
    greeting: escapeHtml(firstName),
    paragraphs: [
      `<strong>${escapeHtml(fixerName)}</strong> says they completed your task:`,
      `<strong>"${escapeHtml(issueTitle)}"</strong>`,
    ],
    details: [
      ['Completed By', `@${escapeHtml(fixerUsername)}`],
      ['Date', formattedDate],
    ],
    callout: {
      tone: 'success',
      html: `<div style="font-size:24px;font-weight:700;color:#138a3d;">${rewardAmount.toLocaleString()} sats</div><div style="color:#6b7280;font-size:14px;margin-top:4px;">Ready to send when verified</div>`,
    },
    button: { label: 'Review Fix', href: verifyUrl },
  })

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

  const safeRequesterName = escapeHtml(requesterName)

  const html = renderEmail({
    title: 'New Join Request',
    preheader: `${requesterName} has requested to join ${groupName}.`,
    greeting: escapeHtml(firstName),
    paragraphs: [
      `<strong>${safeRequesterName}</strong> has requested to join your group.`,
      `<strong>${escapeHtml(groupName)}</strong>`,
    ],
    details: [
      ['Requested By', safeRequesterName],
      ['Date', formattedDate],
    ],
    button: { label: 'Review Request', href: `${EMAIL_BASE_URL}/groups/${groupId}` },
  })

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

  const html = renderEmail({
    title: 'Join Request Sent',
    preheader: `Your request to join ${groupName} has been submitted.`,
    greeting: escapeHtml(firstName),
    paragraphs: [
      'Your request to join the group has been submitted successfully.',
      `<strong>${escapeHtml(groupName)}</strong> <span style="display:inline-block;background-color:#fef3c7;color:#92400e;padding:4px 12px;border-radius:9999px;font-size:14px;font-weight:500;margin-left:8px;">Pending</span>`,
      "A group admin will review your request and you'll be notified once it's approved.",
      `<span style="color:#6b7280;font-size:14px;">Request submitted: ${formattedDate}</span>`,
    ],
  })

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

  const safeGroupName = escapeHtml(groupName)

  const html = renderEmail({
    title: 'Issue Closed by Admin',
    preheader: `${adminName} (group admin) closed "${issueTitle}" and sent the reward to @${fixerName}.`,
    greeting: escapeHtml(firstName),
    paragraphs: [
      'A group admin has closed an issue you posted:',
      `<strong>"${escapeHtml(issueTitle)}"</strong>`,
    ],
    details: [
      ['Closed by', `${escapeHtml(adminName)} (Group Admin)`],
      ['Group', safeGroupName],
      ['Reward sent to', `@${escapeHtml(fixerName)}`],
      ['Reward amount', `${formattedReward} (~${usdReward})`],
      ['Date', formattedDate],
    ],
    callout: {
      tone: 'info',
      title: 'Why am I getting this?',
      html: `Group admins in ${safeGroupName} have permission to close issues and distribute rewards. This notification is sent for your awareness.`,
    },
    button: {
      label: 'View Issue',
      href: `${process.env.NEXT_PUBLIC_URL || 'https://www.ganamos.earth'}/post/${postId}`,
    },
    footer: 'If you have questions about this action, please contact your group admin.<br>Ganamos Earth',
  })

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

/**
 * Send email notification when a post is expiring soon (6-hour warning)
 */
export async function sendPostExpiryWarningEmail(params: {
  toEmail: string
  userName: string
  postTitle: string
  expiresAt: Date
  postId: string
}): Promise<void> {
  try {
    const { toEmail, userName, postTitle, expiresAt, postId } = params

    // Get first name only
    const firstName = userName.split(' ')[0]

    // Format time remaining using formatDistanceToNow
    const { formatDistanceToNow } = await import('date-fns')
    const timeRemaining = formatDistanceToNow(expiresAt, { addSuffix: false })

    const html = renderEmail({
      title: 'Your post expires soon',
      preheader: `"${postTitle}" expires in ${timeRemaining}.`,
      greeting: escapeHtml(firstName),
      paragraphs: [
        'This is a reminder that your post is expiring soon:',
        `<strong>"${escapeHtml(postTitle)}"</strong>`,
      ],
      details: [['Time remaining', timeRemaining]],
      callout: {
        tone: 'warning',
        html: 'If your post expires without being fixed, it will be automatically taken down and your sats will be refunded to your balance.',
      },
      button: {
        label: 'View Post',
        href: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ganamos.earth'}/post/${postId}`,
      },
      footer: 'You can extend or remove the expiration from the post page.<br>Ganamos Earth',
    })

    await sendEmail(
      toEmail,
      'Your post expires soon',
      html,
      {
        type: 'post_expiry_warning',
        metadata: {
          userName,
          postTitle,
          expiresAt: expiresAt.toISOString(),
          postId,
        }
      }
    )
  } catch (error) {
    console.error('Error sending post expiry warning email:', error)
    // Don't throw - email failures should not block the cron job
  }
}

/**
 * Send email notification when a post has expired and sats have been refunded
 */
export async function sendPostExpiredConfirmationEmail(params: {
  toEmail: string
  userName: string
  postTitle: string
  refundAmountSats: number
  postId: string
}): Promise<void> {
  try {
    const { toEmail, userName, postTitle, refundAmountSats, postId } = params

    // Get first name only
    const firstName = userName.split(' ')[0]

    // Format amount
    const formattedAmount = formatSatsValue(refundAmountSats)
    const usdAmount = await convertSatsToUSD(refundAmountSats)

    const html = renderEmail({
      title: 'Your post expired and your sats were refunded',
      preheader: `"${postTitle}" expired and ${formattedAmount} was refunded to your balance.`,
      greeting: escapeHtml(firstName),
      paragraphs: [
        'Your post has expired and has been automatically taken down:',
        `<strong>"${escapeHtml(postTitle)}"</strong>`,
      ],
      details: [
        ['Refund amount', `${formattedAmount} (~${usdAmount})`],
        ['Status', 'Refunded to your balance'],
      ],
      callout: {
        tone: 'info',
        title: 'Your sats are back',
        html: 'The full reward amount has been returned to your account balance. You can use it to create a new post or withdraw it anytime.',
      },
      button: {
        label: 'View Your Balance',
        href: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ganamos.earth'}/profile`,
      },
      footer: 'Thanks for using Ganamos!<br>Ganamos Earth',
    })

    await sendEmail(
      toEmail,
      'Your post has expired — sats refunded',
      html,
      {
        type: 'post_expired_confirmation',
        metadata: {
          userName,
          postTitle,
          refundAmountSats,
          postId,
        }
      }
    )
  } catch (error) {
    console.error('Error sending post expired confirmation email:', error)
    // Don't throw - email failures should not block the cron job
  }
}

/**
 * Send email notification to fixer when an assigned post expires
 */
export async function sendPostExpiredFixerEmail(params: {
  toEmail: string
  fixerName: string
  postTitle: string
  postId: string
}): Promise<void> {
  try {
    const { toEmail, fixerName, postTitle, postId } = params

    // Get first name only
    const firstName = fixerName.split(' ')[0]

    const html = renderEmail({
      title: 'A post you were assigned has expired',
      preheader: `"${postTitle}" expired and no longer needs a fix.`,
      greeting: escapeHtml(firstName),
      paragraphs: [
        'A post you were assigned to fix has expired and been automatically removed:',
        `<strong>"${escapeHtml(postTitle)}"</strong>`,
      ],
      callout: {
        tone: 'warning',
        title: 'What this means',
        html: "The post has been taken down and no longer needs a fix. The reward has been refunded to the poster. You're free to work on other posts!",
      },
      button: {
        label: 'Browse Available Posts',
        href: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ganamos.earth'}/feed`,
      },
      footer: 'Thanks for being part of the Ganamos community!<br>Ganamos Earth',
    })

    await sendEmail(
      toEmail,
      'A post you were assigned has expired',
      html,
      {
        type: 'post_expired_fixer',
        metadata: {
          fixerName,
          postTitle,
          postId,
        }
      }
    )
  } catch (error) {
    console.error('Error sending post expired fixer email:', error)
    // Don't throw - email failures should not block the cron job
  }
}
