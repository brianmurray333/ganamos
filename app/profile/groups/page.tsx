"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Groups</h1>
          </div>
        </div>
      </div>

      <div className="container px-4 py-6 mx-auto max-w-md pb-24">
        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <Button
            onClick={() => router.push("/groups/search")}
            variant="outline"
            className="flex-1 rounded-xl h-12 border-gray-200 dark:border-gray-700"
          >
            <Search className="w-4 h-4 mr-2" />
            Find Group
          </Button>
          <Button
            onClick={() => setShowCreateGroupDialog(true)}
            className="flex-1 rounded-xl h-12"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Group
          </Button>
        </div>

        {/* Groups List */}
        <Card className="shadow-lg rounded-2xl border-0 bg-white dark:bg-card">
          <CardContent className="p-4">
            <GroupsList 
              userId={activeUserId || user.id} 
              prefetchedGroups={prefetchedGroups}
              onGroupsFetched={setPrefetchedGroups}
            />
          </CardContent>
        </Card>

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

