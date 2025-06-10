export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          name: string | null
          avatar_url: string | null
          balance: number
          created_at: string
          updated_at: string
          fixed_issues_count: number
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          avatar_url?: string | null
          balance?: number
          created_at?: string
          updated_at?: string
          fixed_issues_count?: number
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          avatar_url?: string | null
          balance?: number
          created_at?: string
          updated_at?: string
          fixed_issues_count?: number
        }
      }
      posts: {
        Row: {
          id: string
          user_id: string | null
          title: string
          description: string
          image_url: string
          location: string
          latitude: number | null
          longitude: number | null
          reward: number
          claimed: boolean
          claimed_by: string | null
          claimed_at: string | null
          fixed: boolean
          fixed_at: string | null
          fixed_image_url: string | null
          fixed_by: string | null
          created_at: string
          group_id: string | null
          city: string | null
          fixer_note: string | null
          created_by: string | null
          created_by_avatar: string | null
          under_review: boolean
          submitted_fix_by_id: string | null
          submitted_fix_by_name: string | null
          submitted_fix_by_avatar: string | null
          submitted_fix_at: string | null
          submitted_fix_image_url: string | null
          submitted_fix_note: string | null
          ai_confidence_score: number | null
          ai_analysis: string | null
          original_reward: number | null
          total_boost_amount: number
          boost_applied: boolean
          is_anonymous: boolean | null
          funding_payment_request: string | null
          funding_r_hash: string | null
          funding_status: "pending" | "paid" | "expired" | null
          // Fields for anonymous fix payouts
          fixed_by_is_anonymous: boolean // << ADDED
          anonymous_reward_paid_at: string | null // << ADDED (TIMESTAMPTZ in DB)
          anonymous_reward_payment_hash: string | null // << ADDED (TEXT in DB)
        }
        Insert: {
          id?: string
          user_id?: string | null
          title: string
          description: string
          image_url: string
          location: string
          latitude?: number | null
          longitude?: number | null
          reward: number
          claimed?: boolean
          claimed_by?: string | null
          claimed_at?: string | null
          fixed?: boolean
          fixed_at?: string | null
          fixed_image_url?: string | null
          fixed_by?: string | null
          created_at?: string
          group_id?: string | null
          city?: string | null
          fixer_note?: string | null
          created_by?: string | null
          created_by_avatar?: string | null
          under_review?: boolean
          submitted_fix_by_id?: string | null
          submitted_fix_by_name?: string | null
          submitted_fix_by_avatar?: string | null
          submitted_fix_at?: string | null
          submitted_fix_image_url?: string | null
          submitted_fix_note?: string | null
          ai_confidence_score?: number | null
          ai_analysis?: string | null
          original_reward?: number | null
          total_boost_amount?: number
          boost_applied?: boolean
          is_anonymous?: boolean | null
          funding_payment_request?: string | null
          funding_r_hash?: string | null
          funding_status?: "pending" | "paid" | "expired" | null
          // Fields for anonymous fix payouts
          fixed_by_is_anonymous?: boolean
          anonymous_reward_paid_at?: string | null
          anonymous_reward_payment_hash?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          title?: string
          description?: string
          image_url?: string
          location?: string
          latitude?: number | null
          longitude?: number | null
          reward?: number
          claimed?: boolean
          claimed_by?: string | null
          claimed_at?: string | null
          fixed?: boolean
          fixed_at?: string | null
          fixed_image_url?: string | null
          fixed_by?: string | null
          created_at?: string
          group_id?: string | null
          city?: string | null
          fixer_note?: string | null
          created_by?: string | null
          created_by_avatar?: string | null
          under_review?: boolean
          submitted_fix_by_id?: string | null
          submitted_fix_by_name?: string | null
          submitted_fix_by_avatar?: string | null
          submitted_fix_at?: string | null
          submitted_fix_image_url?: string | null
          submitted_fix_note?: string | null
          ai_confidence_score?: number | null
          ai_analysis?: string | null
          original_reward?: number | null
          total_boost_amount?: number
          boost_applied?: boolean
          is_anonymous?: boolean | null
          funding_payment_request?: string | null
          funding_r_hash?: string | null
          funding_status?: "pending" | "paid" | "expired" | null
          // Fields for anonymous fix payouts
          fixed_by_is_anonymous?: boolean
          anonymous_reward_paid_at?: string | null
          anonymous_reward_payment_hash?: string | null
        }
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string | null
          created_by: string
          created_at: string
          updated_at: string
          invite_code: string
          group_code: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          invite_code?: string
          group_code?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          invite_code?: string
          group_code?: string
        }
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          role: "admin" | "member"
          status: "pending" | "approved" | "rejected"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          role?: "admin" | "member"
          status?: "pending" | "approved" | "rejected"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          role?: "admin" | "member"
          status?: "pending" | "approved" | "rejected"
          created_at?: string
          updated_at?: string
        }
      }
      connected_accounts: {
        Row: {
          id: string
          primary_user_id: string
          connected_user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          primary_user_id: string
          connected_user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          primary_user_id?: string
          connected_user_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: "deposit" | "withdrawal" | "internal"
          amount: number
          status: "pending" | "completed" | "failed"
          r_hash_str: string | null
          payment_request: string | null
          payment_hash: string | null
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: "deposit" | "withdrawal" | "internal"
          amount: number
          status?: "pending" | "completed" | "failed"
          r_hash_str?: string | null
          payment_request?: string | null
          payment_hash?: string | null
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: "deposit" | "withdrawal" | "internal"
          amount?: number
          status?: "pending" | "completed" | "failed"
          r_hash_str?: string | null
          payment_request?: string | null
          payment_hash?: string | null
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      donation_pools: {
        Row: {
          id: string
          location_type: "neighborhood" | "city" | "region" | "country" | "global"
          location_name: string
          location_code: string | null
          latitude: number | null
          longitude: number | null
          total_donated: number
          current_balance: number
          total_boosted: number
          boost_percentage: number
          max_daily_boost: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_type: "neighborhood" | "city" | "region" | "country" | "global"
          location_name: string
          location_code?: string | null
          latitude?: number | null
          longitude?: number | null
          total_donated?: number
          current_balance?: number
          total_boosted?: number
          boost_percentage?: number
          max_daily_boost?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_type?: "neighborhood" | "city" | "region" | "country" | "global"
          location_name?: string
          location_code?: string | null
          latitude?: number | null
          longitude?: number | null
          total_donated?: number
          current_balance?: number
          total_boosted?: number
          boost_percentage?: number
          max_daily_boost?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      donations: {
        Row: {
          id: string
          donor_user_id: string | null
          donation_pool_id: string
          amount: number
          payment_hash: string | null
          payment_request: string | null
          status: "pending" | "completed" | "failed"
          donor_name: string | null
          message: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          donor_user_id?: string | null
          donation_pool_id: string
          amount: number
          payment_hash?: string | null
          payment_request?: string | null
          status?: "pending" | "completed" | "failed"
          donor_name?: string | null
          message?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          donor_user_id?: string | null
          donation_pool_id?: string
          amount?: number
          payment_hash?: string | null
          payment_request?: string | null
          status?: "pending" | "completed" | "failed"
          donor_name?: string | null
          message?: string | null
          created_at?: string
          completed_at?: string | null
        }
      }
      post_boosts: {
        Row: {
          id: string
          post_id: string
          donation_pool_id: string
          boost_amount: number
          boost_percentage: number
          applied_at: string
        }
        Insert: {
          id?: string
          post_id: string
          donation_pool_id: string
          boost_amount: number
          boost_percentage: number
          applied_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          donation_pool_id?: string
          boost_amount?: number
          boost_percentage?: number
          applied_at?: string
        }
      }
      location_hierarchy: {
        Row: {
          id: string
          child_pool_id: string
          parent_pool_id: string
          created_at: string
        }
        Insert: {
          id?: string
          child_pool_id: string
          parent_pool_id: string
          created_at?: string
        }
        Update: {
          id?: string
          child_pool_id?: string
          parent_pool_id?: string
          created_at?: string
        }
      }
    }
  }
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type Post = Database["public"]["Tables"]["posts"]["Row"]
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"]
export type Group = Database["public"]["Tables"]["groups"]["Row"]
export type GroupMember = Database["public"]["Tables"]["group_members"]["Row"]
export type ConnectedAccount = Database["public"]["Tables"]["connected_accounts"]["Row"]
export type DonationPool = Database["public"]["Tables"]["donation_pools"]["Row"]
export type Donation = Database["public"]["Tables"]["donations"]["Row"]
export type PostBoost = Database["public"]["Tables"]["post_boosts"]["Row"]
export type LocationHierarchy = Database["public"]["Tables"]["location_hierarchy"]["Row"]
