/**
 * Fraud Detection Sampling Logic
 * Implements tiered random sampling for fraud detection based on:
 * - Confidence scores
 * - Reward amounts
 * Uses cryptographically secure randomness for fairness
 */

import { randomBytes } from 'crypto';

/**
 * Determine if a submission should undergo additional fraud checking
 * based on confidence score and reward amount
 * 
 * Sampling rates:
 * - Baseline: 10% for confidence ≥7
 * - Medium risk: 25% for rewards >10k sats
 * - High risk: 50% for rewards >50k sats
 * 
 * @param confidence - Fraud check confidence score (0-10)
 * @param rewardAmount - Reward amount in satoshis
 * @returns true if should sample for additional checks
 */
export function shouldRandomSample(
  confidence: number,
  rewardAmount: number
): boolean {
  // Always sample if confidence is low (below 7)
  if (confidence < 7) {
    return true;
  }

  // Determine sampling rate based on reward amount
  let samplingRate = 0.10; // Baseline 10%

  if (rewardAmount > 50000) {
    samplingRate = 0.50; // 50% for high-value rewards
  } else if (rewardAmount > 10000) {
    samplingRate = 0.25; // 25% for medium-value rewards
  }

  // Use cryptographically secure randomness
  const randomValue = getSecureRandomFloat();
  
  const shouldSample = randomValue < samplingRate;

  if (shouldSample) {
    console.log(
      `📊 Random sampling triggered: confidence=${confidence}, reward=${rewardAmount} sats, rate=${samplingRate * 100}%`
    );
  }

  return shouldSample;
}

/**
 * Generate a cryptographically secure random float between 0 and 1
 * Uses crypto.randomBytes for true randomness
 * @returns Random float in range [0, 1)
 */
function getSecureRandomFloat(): number {
  // Generate 4 random bytes (32 bits)
  const bytes = randomBytes(4);
  
  // Convert to unsigned 32-bit integer
  const randomInt = bytes.readUInt32BE(0);
  
  // Convert to float in range [0, 1)
  return randomInt / 0x100000000;
}

/**
 * Calculate adjusted sampling rate for a given scenario
 * Useful for monitoring and analytics
 * @param confidence - Confidence score
 * @param rewardAmount - Reward amount in satoshis
 * @returns Sampling rate as decimal (e.g., 0.25 for 25%)
 */
export function getSamplingRate(
  confidence: number,
  rewardAmount: number
): number {
  // Always sample low confidence
  if (confidence < 7) {
    return 1.0;
  }

  // Determine rate based on reward amount
  if (rewardAmount > 50000) {
    return 0.50;
  } else if (rewardAmount > 10000) {
    return 0.25;
  } else {
    return 0.10;
  }
}

/**
 * Determine sampling strategy details for a submission
 * Useful for logging and debugging
 * @param confidence - Confidence score
 * @param rewardAmount - Reward amount in satoshis
 * @returns Sampling strategy details
 */
export interface SamplingStrategy {
  shouldSample: boolean;
  samplingRate: number;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export function determineSamplingStrategy(
  confidence: number,
  rewardAmount: number
): SamplingStrategy {
  // Critical risk - low confidence
  if (confidence < 7) {
    return {
      shouldSample: true,
      samplingRate: 1.0,
      reason: 'Low confidence score requires full review',
      riskLevel: 'critical',
    };
  }

  // High risk - large reward
  if (rewardAmount > 50000) {
    const shouldSample = shouldRandomSample(confidence, rewardAmount);
    return {
      shouldSample,
      samplingRate: 0.50,
      reason: 'High-value reward (>50k sats)',
      riskLevel: 'high',
    };
  }

  // Medium risk - moderate reward
  if (rewardAmount > 10000) {
    const shouldSample = shouldRandomSample(confidence, rewardAmount);
    return {
      shouldSample,
      samplingRate: 0.25,
      reason: 'Medium-value reward (>10k sats)',
      riskLevel: 'medium',
    };
  }

  // Low risk - baseline sampling
  const shouldSample = shouldRandomSample(confidence, rewardAmount);
  return {
    shouldSample,
    samplingRate: 0.10,
    reason: 'Baseline random sampling',
    riskLevel: 'low',
  };
}

/**
 * Calculate expected number of samples from a batch
 * Useful for capacity planning
 * @param submissions - Array of {confidence, rewardAmount} objects
 * @returns Expected sample count
 */
export function calculateExpectedSamples(
  submissions: Array<{ confidence: number; rewardAmount: number }>
): number {
  return submissions.reduce((total, submission) => {
    const rate = getSamplingRate(submission.confidence, submission.rewardAmount);
    return total + rate;
  }, 0);
}
