"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PostCard } from "@/components/post-card";
import type { Post } from "@/lib/types";

export default function PostsPage() {
  const { user, profile, loading, session, sessionLoaded, activeUserId } = useAuth();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  
  const [postedIssues, setPostedIssues] = useState<Post[]>([]);
  const [fixedIssues, setFixedIssues] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [postsSubTab, setPostsSubTab] = useState<"all" | "posted" | "fixed">("all");

  const fetchPosts = useCallback(async () => {
    if (!activeUserId) return;

    try {
      // Fetch posts created by user
      const { data: posted, error: postedError } = await supabase
        .from("posts")
        .select(`
          *,
          group:group_id(id, name),
          assigned_to_user:assigned_to(id, name)
        `)
        .eq("user_id", activeUserId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      // Fetch posts fixed by user
      const { data: fixed, error: fixedError } = await supabase
        .from("posts")
        .select(`
          *,
          group:group_id(id, name),
          assigned_to_user:assigned_to(id, name)
        `)
        .eq("fixed_by", activeUserId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!postedError && posted) {
        setPostedIssues(posted);
      }
      if (!fixedError && fixed) {
        setFixedIssues(fixed);
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeUserId, supabase]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/auth/login");
    }
  }, [sessionLoaded, session, router]);

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

  const getPostsToShow = () => {
    switch (postsSubTab) {
      case "posted":
        return postedIssues;
      case "fixed":
        return fixedIssues;
      default:
        // Combine and sort by date
        const all = [...postedIssues, ...fixedIssues];
        // Deduplicate by id (in case a post was both created and fixed by user)
        const unique = Array.from(new Map(all.map(p => [p.id, p])).values());
        return unique.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
    }
  };

  const postsToShow = getPostsToShow();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Your Posts</h1>
          </div>
        </div>
      </div>

      <div className="container px-4 py-6 mx-auto max-w-md pb-24">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setPostsSubTab("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              postsSubTab === "all"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setPostsSubTab("posted")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              postsSubTab === "posted"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
            }`}
          >
            Posted {postedIssues.length > 0 && `(${postedIssues.length})`}
          </button>
          <button
            onClick={() => setPostsSubTab("fixed")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              postsSubTab === "fixed"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
            }`}
          >
            Fixed {fixedIssues.length > 0 && `(${fixedIssues.length})`}
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="shadow-sm rounded-xl border-0 bg-white dark:bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : postsToShow.length > 0 ? (
          <div className="space-y-4">
            {postsToShow.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {postsSubTab === "all" 
                ? "No posts yet" 
                : postsSubTab === "posted" 
                  ? "No posts created yet" 
                  : "No posts fixed yet"}
            </p>
            <Button onClick={() => router.push("/dashboard")} variant="outline" className="rounded-xl">
              Start exploring issues
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

