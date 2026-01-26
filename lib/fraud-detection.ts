/**
 * Fraud Detection Service
 * Comprehensive fraud detection for image submissions including:
 * - EXIF metadata verification
 * - Perceptual image hashing for duplicate detection
 * - GPS coordinate matching
 * - Visual anomaly detection
 * - Fast and slow fraud check pipelines
 */

import exifr from 'exifr';
import { bmvbhash } from 'blockhash-core';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// Initialize Supabase client for database queries
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// Type Definitions
// ============================================================================

export interface FullExifMetadata {
  // Camera information
  make?: string;
  model?: string;
  
  // Camera settings
  shutterSpeed?: number;
  aperture?: number;
  focalLength?: number;
  iso?: number;
  
  // GPS data
  latitude?: number;
  longitude?: number;
  altitude?: number;
  
  // Timestamps
  dateTimeOriginal?: Date;
  createDate?: Date;
  modifyDate?: Date;
  
  // Software/editing
  software?: string;
  
  // Image properties
  width?: number;
  height?: number;
  orientation?: number;
}

export interface ExifAuthenticityResult {
  isComplete: boolean;
  missingCriticalFields: string[];
  suspiciousFields: string[];
  confidenceScore: number; // 0-10
}

export interface GpsMatchResult {
  matches: boolean;
  distanceMeters: number;
  confidenceScore: number; // 0-10
}

export interface VisualAnomalyResult {
  hasAnomalies: boolean;
  compressionArtifacts: boolean;
  suspiciousPatterns: string[];
  confidenceScore: number; // 0-10
}

export interface FraudCheckResult {
  passed: boolean;
  flags: string[];
  scores: {
    exifAuthenticity: number;
    gpsMatch: number;
    visualQuality: number;
    duplicateCheck: number;
    overall: number;
  };
  requiresManualReview: boolean;
  metadata?: {
    exifData?: FullExifMetadata;
    duplicatePostIds?: string[];
    gpsDistance?: number;
  };
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchingPostIds: string[];
  matchingHashes: string[];
}

// ============================================================================
// EXIF Metadata Extraction and Verification
// ============================================================================

/**
 * Extract comprehensive EXIF metadata from an image
 * @param imageBuffer - Image buffer or Blob
 * @returns Full EXIF metadata including camera settings, GPS, timestamps
 */
export async function extractFullExifMetadata(
  imageBuffer: Buffer | Blob
): Promise<FullExifMetadata | null> {
  try {
    const exifData = await exifr.parse(imageBuffer, {
      tiff: true,
      xmp: true,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: true,
      gps: true,
      interop: true,
      exif: true,
    });

    if (!exifData) {
      console.log('No EXIF data found in image');
      return null;
    }

    const metadata: FullExifMetadata = {
      // Camera info
      make: exifData.Make,
      model: exifData.Model,
      
      // Camera settings
      shutterSpeed: exifData.ExposureTime || exifData.ShutterSpeedValue,
      aperture: exifData.FNumber || exifData.ApertureValue,
      focalLength: exifData.FocalLength,
      iso: exifData.ISO || exifData.ISOSpeedRatings,
      
      // GPS
      latitude: exifData.latitude,
      longitude: exifData.longitude,
      altitude: exifData.GPSAltitude,
      
      // Timestamps
      dateTimeOriginal: exifData.DateTimeOriginal ? new Date(exifData.DateTimeOriginal) : undefined,
      createDate: exifData.CreateDate ? new Date(exifData.CreateDate) : undefined,
      modifyDate: exifData.ModifyDate ? new Date(exifData.ModifyDate) : undefined,
      
      // Software
      software: exifData.Software,
      
      // Image dimensions
      width: exifData.ImageWidth || exifData.ExifImageWidth,
      height: exifData.ImageHeight || exifData.ExifImageHeight,
      orientation: exifData.Orientation,
    };

    return metadata;
  } catch (error) {
    console.error('Error extracting EXIF metadata:', error);
    return null;
  }
}

/**
 * Verify EXIF metadata authenticity and completeness
 * Flags missing critical fields and suspicious patterns
 * @param metadata - EXIF metadata to verify
 * @returns Authenticity assessment with confidence score
 */
export function verifyExifAuthenticity(
  metadata: FullExifMetadata | null
): ExifAuthenticityResult {
  if (!metadata) {
    return {
      isComplete: false,
      missingCriticalFields: ['all'],
      suspiciousFields: [],
      confidenceScore: 0,
    };
  }

  const missingCriticalFields: string[] = [];
  const suspiciousFields: string[] = [];

  // Check for critical camera metadata
  if (!metadata.make && !metadata.model) {
    missingCriticalFields.push('camera_info');
  }
  
  if (!metadata.dateTimeOriginal && !metadata.createDate) {
    missingCriticalFields.push('timestamp');
  }

  // Check for suspicious editing software
  if (metadata.software) {
    const editingSoftware = [
      'photoshop',
      'gimp',
      'paint.net',
      'affinity',
      'pixlr',
    ];
    const softwareLower = metadata.software.toLowerCase();
    if (editingSoftware.some(sw => softwareLower.includes(sw))) {
      suspiciousFields.push('editing_software');
    }
  }

  // Check for suspicious timestamp patterns
  if (metadata.dateTimeOriginal && metadata.modifyDate) {
    const timeDiff = Math.abs(
      metadata.modifyDate.getTime() - metadata.dateTimeOriginal.getTime()
    );
    // If modified more than 1 hour after capture, flag it
    if (timeDiff > 3600000) {
      suspiciousFields.push('modified_timestamp');
    }
  }

  // Calculate confidence score (0-10)
  let score = 10;
  score -= missingCriticalFields.length * 3; // -3 per missing critical field
  score -= suspiciousFields.length * 2; // -2 per suspicious field
  score = Math.max(0, Math.min(10, score));

  return {
    isComplete: missingCriticalFields.length === 0,
    missingCriticalFields,
    suspiciousFields,
    confidenceScore: score,
  };
}

// ============================================================================
// Perceptual Image Hashing
// ============================================================================

/**
 * Calculate perceptual hash for an image using blockhash algorithm
 * Generates a hash that is resistant to minor modifications
 * @param imageBuffer - Image buffer
 * @returns Perceptual hash string
 */
export async function calculatePerceptualHash(
  imageBuffer: Buffer
): Promise<string> {
  try {
    // Resize image to standard size for consistent hashing
    const resized = await sharp(imageBuffer)
      .resize(256, 256, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Create ImageData-like object
    const imageData = {
      width: resized.info.width,
      height: resized.info.height,
      data: new Uint8ClampedArray(resized.data),
    };

    // Calculate hash using blockhash
    const bits = 16; // 16x16 = 256 bit hash
    const hash = bmvbhash(imageData, bits);

    return hash;
  } catch (error) {
    console.error('Error calculating perceptual hash:', error);
    throw new Error('Failed to calculate image hash');
  }
}

/**
 * Check if an image is a duplicate by comparing perceptual hashes
 * @param imageHash - Perceptual hash of the image
 * @param postId - Current post ID (to exclude from search)
 * @returns Duplicate check result with matching post IDs
 */
export async function checkDuplicateImage(
  imageHash: string,
  postId?: string
): Promise<DuplicateCheckResult> {
  try {
    let query = supabase
      .from('image_hashes')
      .select('post_id, image_hash')
      .eq('image_hash', imageHash);

    // Exclude current post if provided
    if (postId) {
      query = query.neq('post_id', postId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking duplicate image:', error);
      return {
        isDuplicate: false,
        matchingPostIds: [],
        matchingHashes: [],
      };
    }

    const uniquePostIds = Array.from(new Set(data?.map(d => d.post_id) || []));

    return {
      isDuplicate: (data?.length || 0) > 0,
      matchingPostIds: uniquePostIds,
      matchingHashes: data?.map(d => d.image_hash) || [],
    };
  } catch (error) {
    console.error('Error in duplicate check:', error);
    return {
      isDuplicate: false,
      matchingPostIds: [],
      matchingHashes: [],
    };
  }
}

// ============================================================================
// GPS Verification
// ============================================================================

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Verify GPS coordinates match expected location within threshold
 * @param exifGps - GPS coordinates from EXIF
 * @param expectedGps - Expected GPS coordinates
 * @param thresholdMeters - Maximum allowed distance in meters (default: 100)
 * @returns GPS match result with distance and confidence score
 */
export function verifyGpsMatch(
  exifGps: { latitude: number; longitude: number } | null,
  expectedGps: { latitude: number; longitude: number },
  thresholdMeters: number = 100
): GpsMatchResult {
  // If no EXIF GPS, return neutral result
  if (!exifGps || !exifGps.latitude || !exifGps.longitude) {
    return {
      matches: false,
      distanceMeters: -1,
      confidenceScore: 5, // Neutral - not suspicious but not verified
    };
  }

  const distance = haversineDistance(
    exifGps.latitude,
    exifGps.longitude,
    expectedGps.latitude,
    expectedGps.longitude
  );

  const matches = distance <= thresholdMeters;

  // Calculate confidence score based on distance
  let score = 10;
  if (distance > thresholdMeters) {
    // Decrease score based on how far outside threshold
    const excessDistance = distance - thresholdMeters;
    score = Math.max(0, 10 - (excessDistance / 100)); // -1 per 100m excess
  }

  return {
    matches,
    distanceMeters: distance,
    confidenceScore: Math.round(score),
  };
}

// ============================================================================
// Visual Anomaly Detection
// ============================================================================

/**
 * Analyze image for visual anomalies and compression artifacts
 * Uses lightweight statistical analysis on pixel data
 * @param imageBuffer - Image buffer
 * @returns Visual anomaly detection result
 */
export async function analyzeVisualAnomalies(
  imageBuffer: Buffer
): Promise<VisualAnomalyResult> {
  try {
    // Get image stats
    const stats = await sharp(imageBuffer).stats();
    const metadata = await sharp(imageBuffer).metadata();

    const suspiciousPatterns: string[] = [];
    let compressionArtifacts = false;

    // Check for extreme JPEG quality (over-compression)
    if (metadata.format === 'jpeg') {
      // Very low quality images are suspicious
      const avgStdDev = stats.channels.reduce((sum: number, ch: any) => sum + ch.stdev, 0) / stats.channels.length;
      
      if (avgStdDev < 10) {
        compressionArtifacts = true;
        suspiciousPatterns.push('heavy_compression');
      }
    }

    // Check for unusual color distribution
    const isGrayscale = stats.isOpaque && stats.channels.length === 1;
    if (!isGrayscale) {
      const channels = stats.channels;
      const meanDiff = Math.abs(channels[0].mean - channels[1].mean) +
                       Math.abs(channels[1].mean - channels[2].mean) +
                       Math.abs(channels[0].mean - channels[2].mean);
      
      // Very uniform color channels can indicate AI generation
      if (meanDiff < 5) {
        suspiciousPatterns.push('uniform_color_distribution');
      }
    }

    // Check for suspicious dimensions (common AI generation sizes)
    const aiCommonSizes = [512, 768, 1024, 1536, 2048];
    if (metadata.width && metadata.height) {
      if (aiCommonSizes.includes(metadata.width) && aiCommonSizes.includes(metadata.height)) {
        suspiciousPatterns.push('ai_common_dimensions');
      }
    }

    // Calculate confidence score
    let score = 10;
    score -= suspiciousPatterns.length * 2;
    score -= compressionArtifacts ? 3 : 0;
    score = Math.max(0, Math.min(10, score));

    return {
      hasAnomalies: suspiciousPatterns.length > 0 || compressionArtifacts,
      compressionArtifacts,
      suspiciousPatterns,
      confidenceScore: score,
    };
  } catch (error) {
    console.error('Error analyzing visual anomalies:', error);
    return {
      hasAnomalies: false,
      compressionArtifacts: false,
      suspiciousPatterns: [],
      confidenceScore: 5, // Neutral on error
    };
  }
}

// ============================================================================
// Fast and Slow Fraud Check Pipelines
// ============================================================================

/**
 * Run fast synchronous fraud checks (EXIF, hash, GPS)
 * Returns immediately with results for real-time validation
 * @param imageBuffer - Image buffer
 * @param expectedGps - Expected GPS coordinates
 * @param postId - Post ID for duplicate checking
 * @returns Fraud check result
 */
export async function runFastFraudChecks(
  imageBuffer: Buffer,
  expectedGps: { latitude: number; longitude: number },
  postId?: string
): Promise<FraudCheckResult> {
  const flags: string[] = [];
  const scores = {
    exifAuthenticity: 10,
    gpsMatch: 10,
    visualQuality: 10,
    duplicateCheck: 10,
    overall: 10,
  };

  try {
    // 1. Extract and verify EXIF
    const exifData = await extractFullExifMetadata(imageBuffer);
    const exifAuth = verifyExifAuthenticity(exifData);
    scores.exifAuthenticity = exifAuth.confidenceScore;

    if (!exifAuth.isComplete) {
      flags.push('incomplete_exif');
    }
    if (exifAuth.suspiciousFields.length > 0) {
      flags.push('suspicious_exif_fields');
    }

    // 2. Calculate hash and check duplicates
    const imageHash = await calculatePerceptualHash(imageBuffer);
    const duplicateCheck = await checkDuplicateImage(imageHash, postId);
    
    if (duplicateCheck.isDuplicate) {
      flags.push('duplicate_image');
      scores.duplicateCheck = 0;
    }

    // 3. Verify GPS match
    const gpsData = exifData ? { latitude: exifData.latitude!, longitude: exifData.longitude! } : null;
    const gpsMatch = verifyGpsMatch(gpsData, expectedGps);
    scores.gpsMatch = gpsMatch.confidenceScore;

    if (!gpsMatch.matches) {
      flags.push('gps_mismatch');
    }

    // 4. Quick visual check
    const visualCheck = await analyzeVisualAnomalies(imageBuffer);
    scores.visualQuality = visualCheck.confidenceScore;

    if (visualCheck.hasAnomalies) {
      flags.push('visual_anomalies');
    }

    // Calculate overall score
    scores.overall = Math.round(
      (scores.exifAuthenticity +
       scores.gpsMatch +
       scores.visualQuality +
       scores.duplicateCheck) / 4
    );

    // Determine if manual review is required
    const requiresManualReview =
      scores.overall < 7 ||
      duplicateCheck.isDuplicate ||
      flags.includes('gps_mismatch');

    const passed = scores.overall >= 7 && !duplicateCheck.isDuplicate;

    return {
      passed,
      flags,
      scores,
      requiresManualReview,
      metadata: {
        exifData: exifData || undefined,
        duplicatePostIds: duplicateCheck.matchingPostIds,
        gpsDistance: gpsMatch.distanceMeters,
      },
    };
  } catch (error) {
    console.error('Error in fast fraud checks:', error);
    return {
      passed: false,
      flags: ['check_error'],
      scores: {
        exifAuthenticity: 0,
        gpsMatch: 0,
        visualQuality: 0,
        duplicateCheck: 0,
        overall: 0,
      },
      requiresManualReview: true,
    };
  }
}

/**
 * Queue image for slow asynchronous fraud checks (AI analysis, deep forensics)
 * These checks run in background and update post status when complete
 * @param postId - Post ID
 * @param imageUrl - Image URL to analyze
 * @param imageType - Type of image (before, after, submitted_fix)
 * @returns Success status
 */
export async function queueSlowFraudChecks(
  postId: string,
  imageUrl: string,
  imageType: 'before' | 'after' | 'submitted_fix'
): Promise<boolean> {
  try {
    const { error } = await supabase.from('fraud_queue').insert({
      post_id: postId,
      image_url: imageUrl,
      image_type: imageType,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error queueing slow fraud checks:', error);
      return false;
    }

    console.log(`✓ Queued slow fraud checks for post ${postId}`);
    return true;
  } catch (error) {
    console.error('Error in queueSlowFraudChecks:', error);
    return false;
  }
}
