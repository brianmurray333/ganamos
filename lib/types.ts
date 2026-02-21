export interface Post {
  id: string
  userId?: string
  user_id?: string
  title: string
  description: string
  imageUrl?: string
  image_url?: string
  location?: string // Make optional
  latitude?: number // Add optional latitude
  longitude?: number // Add optional longitude
  reward: number
  fixed: boolean
  fixed_at?: string
  fixed_by?: string | null
  fixed_by_is_anonymous?: boolean
  created_by?: string // Add this line
  created_by_avatar?: string
  createdAt?: Date
  created_at?: string
  group_id?: string
  group?: {
    id: string
    name: string
    description?: string
  }
  fixer_note?: string | null
  original_reward?: number
  total_boost_amount?: number
  boost_applied?: boolean
  under_review?: boolean
  submitted_at?: string
  submitted_fix_by_id?: string | null
  submitted_fix_at?: string | null
  submitted_fix_by_name?: string | null
  submitted_fix_by_avatar?: string | null
  submitted_fix_image_url?: string | null
  fixed_image_url?: string | null
  submitted_fix_note?: string | null
  submitted_fix_lightning_address?: string | null
  city?: string | null
  ai_confidence_score?: number | null
  deleted_at?: string | null
  ai_analysis?: string | null
  assigned_to?: string | null // UUID of user this job is assigned to
  assigned_to_user?: {
    id: string
    name: string
  } | null
  expires_at?: string | null
  expiry_warning_sent_at?: string | null
  // Fraud detection fields
  fraud_check_flags?: Record<string, any> | null
  exif_verified?: boolean | null
  exif_data?: Record<string, any> | null
  ai_forensics_score?: number | null
  image_hash_before?: string | null
  image_hash_after?: string | null
  requires_manual_review?: boolean | null
  fraud_review_notes?: string | null
  fraud_review_status?: 'pending' | 'approved' | 'rejected' | 'flagged' | null
  random_sampled?: boolean | null
}

export interface ImageHash {
  id: string
  image_hash: string
  post_id: string
  image_type: 'before' | 'after' | 'submitted_fix'
  created_at: string
}

export interface FraudQueueItem {
  id: string
  post_id: string
  image_url: string
  image_type: 'before' | 'after' | 'submitted_fix'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: Record<string, any> | null
  created_at: string
  processed_at?: string | null
}

export interface SubmissionRateLimit {
  id: string
  user_id?: string | null
  ip_address?: string | null
  submission_count: number
  window_start: string
  flagged: boolean
  flagged_at?: string | null
}

export interface User {
  id: string
  name: string
  email: string
  balance: number
  avatar?: string
}

export interface Location {
  id: string
  name: string
  latitude: number
  longitude: number
}

export interface Group {
  id: string
  name: string
  description?: string
  created_by: string
  created_at: string
  updated_at: string
  invite_code: string
  group_code: string
  memberCount?: number
  pendingCount?: number
  hasPendingRequests?: boolean
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: "admin" | "member"
  status: "pending" | "approved" | "rejected"
  created_at: string
  updated_at: string
  profile?: {
    name: string
    avatar_url?: string
    email?: string
  }
}

export interface DonationPool {
  id: string
  location_type: "neighborhood" | "city" | "region" | "country" | "global"
  location_name: string
  location_code?: string
  latitude?: number
  longitude?: number
  total_donated: number
  current_balance: number
  total_boosted: number
  boost_percentage: number
  max_daily_boost?: number
  created_at: string
  updated_at: string
}

export interface Donation {
  id: string
  donor_user_id?: string
  donation_pool_id: string
  amount: number
  payment_hash?: string
  payment_request?: string
  status: "pending" | "completed" | "failed"
  donor_name?: string
  message?: string
  created_at: string
  completed_at?: string
}

export interface PostBoost {
  id: string
  post_id: string
  donation_pool_id: string
  boost_amount: number
  boost_percentage: number
  applied_at: string
}

export interface LocationHierarchy {
  id: string
  child_pool_id: string
  parent_pool_id: string
  created_at: string
}
