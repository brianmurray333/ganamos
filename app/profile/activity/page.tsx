"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { 
  ArrowLeft, 
  MapPin, 
  ArrowDownLeft, 
  ArrowUpRight, 
  RefreshCw, 
  Wallet,
  Camera,
  CheckCircle,
  Clock,
  Gift,
  Wrench,
  FileText,
  Heart,
  Users,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { formatSatsValue, formatTimeAgo } from "@/lib/utils";
import { LoadingSpinner } from "@/components/loading-spinner";
import type { Transaction } from "@/lib/database.types";

type ActivityType = 
  | "deposit" 
  | "withdrawal" 
  | "internal" 
  | "reward" 
  | "post" 
  | "post_created"
  | "fix" 
  | "fix_submitted"
  | "fix_received"
  | "fix_completed"
  | "donation"
  | "group_joined"
  | "device_paired"
  | "post_deleted"
  | "post_claimed";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  amount?: number;
  timestamp: Date;
  postId?: string;
  location?: string;
};

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "deposit":
      return (
        <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
          <ArrowDownLeft className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
      );
    case "withdrawal":
      return (
        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
          <ArrowUpRight className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        </div>
      );
    case "internal":
      return (
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
      );
    case "reward":
      return (
        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
          <Gift className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
      );
    case "post":
    case "post_created":
      return (
        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
          <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
      );
    case "fix":
    case "fix_completed":
      return (
        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
      );
    case "fix_submitted":
      return (
        <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
          <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        </div>
      );
    case "fix_received":
      return (
        <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center">
          <Wrench className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>
      );
    case "donation":
      return (
        <div className="w-10 h-10 bg-pink-100 dark:bg-pink-900/30 rounded-full flex items-center justify-center">
          <Heart className="w-5 h-5 text-pink-600 dark:text-pink-400" />
        </div>
      );
    case "group_joined":
      return (
        <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
          <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
      );
    case "device_paired":
      return (
        <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
        </div>
      );
    case "post_deleted":
      return (
        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
        </div>
      );
    case "post_claimed":
      return (
        <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
          <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
          <Wallet className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
      );
  }
}

function ActivityCard({ activity }: { activity: ActivityItem }) {
  const isClickable = activity.postId;
  
  const content = (
    <Card className="shadow-sm rounded-xl border-0 bg-white dark:bg-card hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ActivityIcon type={activity.type} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-white text-sm">
              {activity.title}
            </p>
            {activity.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {activity.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {activity.amount !== undefined && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 relative">
                    <Image
                      src="/images/bitcoin-logo.png"
                      alt="Bitcoin"
                      width={12}
                      height={12}
                      className="object-contain"
                    />
                  </div>
                  <span className={`text-xs font-medium ${
                    activity.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"
                  }`}>
                    {activity.amount >= 0 ? "+" : ""}{formatSatsValue(Math.abs(activity.amount))}
                  </span>
                </div>
              )}
              {activity.location && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{activity.location}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {formatTimeAgo(activity.timestamp)}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  if (isClickable) {
    return <Link href={`/post/${activity.postId}`}>{content}</Link>;
  }

  return content;
}

export default function ActivityPage() {
  const { user, profile, loading, session, sessionLoaded, activeUserId } = useAuth();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const observerTarget = useRef<HTMLDivElement>(null);

  const ACTIVITIES_PER_PAGE = 20;

  // Transform a transaction record into an ActivityItem
  const transformTransaction = (tx: Transaction): ActivityItem => {
    let title = "Transaction";
    let type: ActivityType = "internal";
    let description = tx.memo || undefined;
    
    switch (tx.transaction_type) {
      case "deposit":
        title = "Deposited Bitcoin";
        type = "deposit";
        break;
      case "withdrawal":
        title = "Withdrew Bitcoin";
        type = "withdrawal";
        // Parse memo for more descriptive message
        if (tx.memo?.includes("Withdrawal of")) {
          description = tx.memo;
        }
        break;
      case "internal":
        if (tx.amount >= 0) {
          title = "Received Bitcoin";
        } else {
          title = "Sent Bitcoin";
        }
        type = "internal";
        break;
      case "reward":
        title = "Reward earned";
        type = "reward";
        // Try to extract post title from memo
        if (tx.memo?.includes(":")) {
          const parts = tx.memo.split(":");
          description = parts.slice(1).join(":").trim();
        }
        break;
    }

    return {
      id: tx.id,
      type,
      title,
      description,
      amount: tx.amount,
      timestamp: new Date(tx.created_at),
    };
  };

  // Transform an activity record into an ActivityItem
  type ActivityRecord = {
    id: string;
    type: string;
    related_id?: string;
    timestamp: string;
    metadata?: {
      title?: string;
      reward?: number;
      amount?: number;
      status?: string;
      action?: string;
      fixer_name?: string;
      pet_name?: string;
      transaction_id?: string;
    };
  };

  const transformActivity = (activity: ActivityRecord): ActivityItem => {
    const meta = activity.metadata || {};
    let title = "Activity";
    let description: string | undefined;
    let amount: number | undefined;
    let postId: string | undefined = activity.related_id;
    let type: ActivityType = "internal";

    switch (activity.type) {
      case "post":
      case "post_created":
        title = "Created an issue";
        description = meta.title;
        type = "post_created";
        break;
      case "fix":
        title = "Fixed an issue";
        description = meta.title;
        amount = meta.reward;
        type = "fix";
        break;
      case "fix_submitted":
        title = "Submitted a fix for review";
        description = meta.title;
        type = "fix_submitted";
        break;
      case "fix_received":
        title = "Received a fix submission";
        description = meta.title;
        type = "fix_received";
        break;
      case "fix_completed":
        title = "Your issue was fixed";
        description = meta.fixer_name 
          ? `${meta.title} - Fixed by ${meta.fixer_name}` 
          : meta.title;
        amount = meta.reward ? -meta.reward : undefined; // Negative because poster pays
        type = "fix_completed";
        break;
      case "donation":
        title = "Made a donation";
        description = meta.title;
        amount = meta.amount ? -meta.amount : undefined;
        type = "donation";
        break;
      case "group_joined":
        title = "Joined a group";
        description = meta.title;
        type = "group_joined";
        postId = undefined;
        break;
      case "device_paired":
        title = "Paired a device";
        description = meta.pet_name ? `${meta.pet_name}` : undefined;
        type = "device_paired";
        postId = undefined;
        break;
      case "post_deleted":
        title = "Deleted an issue";
        description = meta.title;
        type = "post_deleted";
        break;
      case "post_claimed":
        title = "Claimed an issue";
        description = meta.title;
        type = "post_claimed";
        break;
      case "post_fixed":
        title = "Fixed an issue";
        description = meta.title;
        amount = meta.reward;
        type = "fix";
        break;
      default:
        title = activity.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        description = meta.title;
    }

    return {
      id: activity.id,
      type,
      title,
      description,
      amount,
      timestamp: new Date(activity.timestamp),
      postId,
    };
  };

  const fetchActivities = useCallback(async (pageNum: number, append: boolean = false) => {
    // activeUserId is set when viewing a connected account
    // For main account, activeUserId is null, so use profile.id
    const userId = activeUserId || profile?.id;
    if (!userId) return;

    const offset = pageNum * ACTIVITIES_PER_PAGE;
    // Fetch more than needed so we can merge and still have enough
    const fetchLimit = ACTIVITIES_PER_PAGE * 2;

    try {
      // Fetch from both transactions and activities tables in parallel
      const [transactionsResult, activitiesResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(fetchLimit),
        supabase
          .from("activities")
          .select("*")
          .eq("user_id", userId)
          .order("timestamp", { ascending: false })
          .limit(fetchLimit),
      ]);

      if (transactionsResult.error) {
        console.error("Error fetching transactions:", transactionsResult.error);
      }
      if (activitiesResult.error) {
        console.error("Error fetching activities:", activitiesResult.error);
      }

      // Transform both sets of data
      const transactionItems = (transactionsResult.data || []).map(transformTransaction);
      const activityItems = (activitiesResult.data || []).map(transformActivity);

      // Merge and sort by timestamp (newest first)
      const allItems = [...transactionItems, ...activityItems]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Paginate the merged results
      const paginatedItems = allItems.slice(offset, offset + ACTIVITIES_PER_PAGE);
      
      if (append) {
        setActivities(prev => [...prev, ...paginatedItems]);
      } else {
        setActivities(paginatedItems);
      }
      
      // Check if there are more items beyond what we've shown
      setHasMore(offset + ACTIVITIES_PER_PAGE < allItems.length);
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [activeUserId, profile?.id, supabase]);

  useEffect(() => {
    const userId = activeUserId || profile?.id;
    if (userId) {
      fetchActivities(0, false);
    }
  }, [activeUserId, profile?.id, fetchActivities]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          setIsLoadingMore(true);
          const nextPage = page + 1;
          setPage(nextPage);
          fetchActivities(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoadingMore, isLoading, page, fetchActivities]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/auth/login");
    }
  }, [sessionLoaded, session, router]);

  // Scroll to top on mount - must be before any conditional returns
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (sessionLoaded && !session) {
    return null;
  }

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-background">
        <div className="container px-4 pt-6 mx-auto max-w-md">
          <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
            <LoadingSpinner />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-card">
        <div className="container px-4 py-4 mx-auto max-w-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Your Activity</h1>
          </div>
        </div>
      </div>

      <div className="container px-4 py-6 mx-auto max-w-md pb-24">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="shadow-sm rounded-xl border-0 bg-white dark:bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-3 w-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : activities.length > 0 ? (
          <div className="space-y-3">
            {activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
            
            {/* Load more indicator */}
            <div ref={observerTarget} className="h-4" />
            
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">No activity yet</p>
            <Button onClick={() => router.push("/dashboard")} variant="outline" className="rounded-xl">
              Start exploring issues
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
