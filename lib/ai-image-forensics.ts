/**
 * AI Image Forensics
 * Lightweight statistical analysis to detect AI-generated images
 * Checks for patterns commonly found in synthetic images:
 * - Uniform noise patterns
 * - Unnatural frequency distributions
 * - Pixel-level artifacts
 */

import sharp from 'sharp';

/**
 * Result of AI generation pattern detection
 */
export interface AiDetectionResult {
  isLikelyAiGenerated: boolean;
  confidence: number; // 0-1 (0 = definitely real, 1 = definitely AI)
  patterns: {
    uniformNoise: boolean;
    unnaturalFrequencies: boolean;
    pixelArtifacts: boolean;
  };
  scores: {
    noiseUniformity: number;
    frequencyDistribution: number;
    pixelCoherence: number;
    overall: number;
  };
  metadata: {
    noiseStdDev?: number;
    frequencyPeaks?: number;
    edgeConsistency?: number;
  };
}

/**
 * Detect AI-generated image patterns using statistical analysis
 * This is a lightweight heuristic check, not a definitive classifier
 * @param imageBuffer - Image buffer to analyze
 * @returns AI detection result with confidence scores
 */
export async function detectAiGeneratedPatterns(
  imageBuffer: Buffer
): Promise<AiDetectionResult> {
  try {
    // Get image statistics
    const [stats, metadata] = await Promise.all([
      sharp(imageBuffer).stats(),
      sharp(imageBuffer).metadata(),
    ]);

    // Initialize scores
    let noiseScore = 0;
    let frequencyScore = 0;
    let pixelScore = 0;

    // 1. Check for uniform noise patterns
    const noiseResult = analyzeNoiseUniformity(stats);
    noiseScore = noiseResult.score;
    const uniformNoise = noiseResult.isUniform;

    // 2. Check for unnatural frequency distributions
    const frequencyResult = analyzeFrequencyDistribution(stats, metadata);
    frequencyScore = frequencyResult.score;
    const unnaturalFrequencies = frequencyResult.isUnnatural;

    // 3. Check for pixel-level artifacts
    const pixelResult = analyzePixelCoherence(stats);
    pixelScore = pixelResult.score;
    const pixelArtifacts = pixelResult.hasArtifacts;

    // Calculate overall confidence
    const overallScore = (noiseScore + frequencyScore + pixelScore) / 3;
    const isLikelyAiGenerated = overallScore > 0.6; // 60% threshold

    return {
      isLikelyAiGenerated,
      confidence: overallScore,
      patterns: {
        uniformNoise,
        unnaturalFrequencies,
        pixelArtifacts,
      },
      scores: {
        noiseUniformity: noiseScore,
        frequencyDistribution: frequencyScore,
        pixelCoherence: pixelScore,
        overall: overallScore,
      },
      metadata: {
        noiseStdDev: noiseResult.stdDev,
        frequencyPeaks: frequencyResult.peaks,
        edgeConsistency: pixelResult.consistency,
      },
    };
  } catch (error) {
    console.error('Error detecting AI patterns:', error);
    // Return neutral result on error
    return {
      isLikelyAiGenerated: false,
      confidence: 0.5,
      patterns: {
        uniformNoise: false,
        unnaturalFrequencies: false,
        pixelArtifacts: false,
      },
      scores: {
        noiseUniformity: 0.5,
        frequencyDistribution: 0.5,
        pixelCoherence: 0.5,
        overall: 0.5,
      },
      metadata: {},
    };
  }
}

/**
 * Analyze noise uniformity across image channels
 * AI-generated images often have suspiciously uniform noise
 * @param stats - Image statistics from sharp
 * @returns Noise analysis result
 */
function analyzeNoiseUniformity(stats: any): {
  isUniform: boolean;
  score: number;
  stdDev: number;
} {
  const channels = stats.channels;

  // Calculate variance of standard deviations across channels
  const stdDevs = channels.map((ch: any) => ch.stdev);
  const avgStdDev = stdDevs.reduce((sum: number, val: number) => sum + val, 0) / stdDevs.length;
  
  // Calculate how much the standard deviations vary
  const variance = stdDevs.reduce((sum: number, val: number) => {
    return sum + Math.pow(val - avgStdDev, 2);
  }, 0) / stdDevs.length;

  const stdDevOfStdDevs = Math.sqrt(variance);

  // AI images often have very uniform noise (low variance)
  // Natural images have more varied noise across channels
  const isUniform = stdDevOfStdDevs < 5;
  
  // Convert to confidence score (0-1)
  // Lower variance = higher AI likelihood
  const score = Math.max(0, Math.min(1, 1 - stdDevOfStdDevs / 20));

  return {
    isUniform,
    score,
    stdDev: stdDevOfStdDevs,
  };
}

/**
 * Analyze frequency distribution patterns
 * AI-generated images can have unnatural frequency characteristics
 * @param stats - Image statistics
 * @param metadata - Image metadata
 * @returns Frequency analysis result
 */
function analyzeFrequencyDistribution(stats: any, metadata: any): {
  isUnnatural: boolean;
  score: number;
  peaks: number;
} {
  const channels = stats.channels;

  // Analyze channel mean distribution
  const means = channels.map((ch: any) => ch.mean);
  const avgMean = means.reduce((sum: number, val: number) => sum + val, 0) / means.length;

  // Check if all channels have very similar means (suspicious)
  const meanDiffs = means.map((m: number) => Math.abs(m - avgMean));
  const maxMeanDiff = Math.max(...meanDiffs);

  // Very small differences indicate potential AI generation
  const isUnnatural = maxMeanDiff < 5;

  // Check for perfect dimensions (common in AI)
  const perfectDimensions = metadata.width === metadata.height &&
                           [512, 768, 1024, 1536, 2048].includes(metadata.width);

  let score = 0;

  // Add to score if means are too uniform
  if (maxMeanDiff < 10) {
    score += 0.4;
  }

  // Add to score if dimensions are AI-typical
  if (perfectDimensions) {
    score += 0.3;
  }

  // Check for unusual channel correlations
  if (channels.length >= 3) {
    const r_g_diff = Math.abs(channels[0].mean - channels[1].mean);
    const g_b_diff = Math.abs(channels[1].mean - channels[2].mean);
    const r_b_diff = Math.abs(channels[0].mean - channels[2].mean);
    
    // Very similar differences indicate AI
    const diffVariance = Math.max(r_g_diff, g_b_diff, r_b_diff) - Math.min(r_g_diff, g_b_diff, r_b_diff);
    if (diffVariance < 3) {
      score += 0.3;
    }
  }

  return {
    isUnnatural,
    score: Math.min(1, score),
    peaks: maxMeanDiff,
  };
}

/**
 * Analyze pixel coherence and edge consistency
 * AI images can have unnatural smoothness or edge artifacts
 * @param stats - Image statistics
 * @returns Pixel coherence analysis result
 */
function analyzePixelCoherence(stats: any): {
  hasArtifacts: boolean;
  score: number;
  consistency: number;
} {
  const channels = stats.channels;

  // Calculate entropy proxy using min/max ranges
  const ranges = channels.map((ch: any) => ch.max - ch.min);
  const avgRange = ranges.reduce((sum: number, val: number) => sum + val, 0) / ranges.length;

  // Check if ranges are suspiciously similar across channels
  const rangeVariance = ranges.reduce((sum: number, val: number) => {
    return sum + Math.pow(val - avgRange, 2);
  }, 0) / ranges.length;

  const rangeStdDev = Math.sqrt(rangeVariance);

  // Very consistent ranges can indicate AI processing
  const hasArtifacts = rangeStdDev < 5;

  // Calculate score
  const score = Math.max(0, Math.min(1, 1 - rangeStdDev / 30));

  return {
    hasArtifacts,
    score,
    consistency: rangeStdDev,
  };
}

/**
 * Quick check if image dimensions match common AI generation sizes
 * @param width - Image width
 * @param height - Image height
 * @returns true if dimensions match common AI sizes
 */
export function hasAiTypicalDimensions(width: number, height: number): boolean {
  const commonSizes = [512, 768, 1024, 1536, 2048];
  return commonSizes.includes(width) && commonSizes.includes(height);
}

/**
 * Analyze image metadata for AI generation indicators
 * @param exifData - EXIF metadata (can be null)
 * @returns Metadata-based AI likelihood
 */
export function checkAiMetadataIndicators(exifData: any): {
  isLikelyAi: boolean;
  indicators: string[];
} {
  const indicators: string[] = [];

  // No EXIF data at all is suspicious (but not conclusive)
  if (!exifData) {
    indicators.push('missing_exif');
  } else {
    // No camera info is suspicious
    if (!exifData.make && !exifData.model) {
      indicators.push('no_camera_info');
    }

    // No timestamp is suspicious
    if (!exifData.dateTimeOriginal && !exifData.createDate) {
      indicators.push('no_timestamp');
    }

    // Check for AI software signatures
    if (exifData.software) {
      const aiSoftware = [
        'midjourney',
        'stable diffusion',
        'dall-e',
        'dalle',
        'stablediffusion',
        'automatic1111',
      ];
      const softwareLower = exifData.software.toLowerCase();
      if (aiSoftware.some(sw => softwareLower.includes(sw))) {
        indicators.push('ai_software_detected');
      }
    }
  }

  // Consider likely AI if 2+ indicators present
  const isLikelyAi = indicators.length >= 2;

  return {
    isLikelyAi,
    indicators,
  };
}
