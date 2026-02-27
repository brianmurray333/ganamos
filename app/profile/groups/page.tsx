"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/loading-spinner";
import { GroupsList, fetchUserGroups } from "@/components/groups-list";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import type { Group } from "@/lib/types";

export default function GroupsPage() {
  const { user, profile, loading, session, sessionLoaded, activeUserId } = useAuth();
  const router = useRouter();
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [prefetchedGroups, setPrefetchedGroups] = useState<Group[] | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/auth/login");
    }
  }, [sessionLoaded, session, router]);

  // Scroll to top on mount
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Groups</h1>
          </div>
        </div>
      </div>

      <div className="container px-4 py-6 mx-auto max-w-md pb-24">
        {/* Search Bar */}
        <button
          onClick={() => router.push("/groups/search")}
          className="w-full flex items-center gap-3 px-4 h-11 rounded-full bg-white dark:bg-card border border-gray-200 dark:border-gray-700 text-muted-foreground text-sm mb-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span>Find a group...</span>
        </button>

        {/* Create Group Button */}
        <Button
          onClick={() => setShowCreateGroupDialog(true)}
          className="w-full rounded-full h-11 mb-6 font-semibold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Group
        </Button>

        {/* Groups List */}
        <GroupsList 
          userId={activeUserId || user.id} 
          prefetchedGroups={prefetchedGroups}
          onGroupsFetched={setPrefetchedGroups}
        />

        {/* Create Group Dialog */}
        <CreateGroupDialog
          open={showCreateGroupDialog}
          onOpenChange={setShowCreateGroupDialog}
          userId={activeUserId || user.id}
          onSuccess={(newGroup) => {
            setShowCreateGroupDialog(false);
            toast.success("Group Created", {
              description: "Your new group has been created successfully.",
            });
            router.push(`/groups/${newGroup.id}`);
          }}
        />
      </div>
    </div>
  );
}

