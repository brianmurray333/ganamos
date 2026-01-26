"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import type { Group } from "@/lib/types";

interface GroupsListProps {
  userId: string;
  prefetchedGroups?: Group[] | null;
  onGroupsFetched?: (groups: Group[]) => void;
}

// Export the fetch function so it can be used for prefetching
export async function fetchUserGroups(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  userId: string,
  pendingGroupIds: string[]
): Promise<Group[]> {
  try {
    // Fetch groups where the user is a member
    const { data: memberGroups, error: memberError } = await supabase
      .from("group_members")
      .select(
        `
        group_id,
        role,
        status,
        groups:group_id(
          id,
          name,
          description,
          created_by,
          created_at,
          updated_at,
          invite_code
        )
      `
      )
      .eq("user_id", userId)
      .eq("status", "approved");

    if (memberError) {
      console.error("Error fetching member groups:", memberError);
      throw memberError;
    }

    // Transform the data to match the Group interface
    const transformedGroups = memberGroups
      .filter((item) => item.groups) // Filter out any null groups
      .map((item) => {
        const group = item.groups as any;
        return {
          ...group,
          role: item.role,
          status: item.status,
        };
      });

    // Fetch member counts for all groups in two optimized queries
    const groupIds = transformedGroups.map((g) => g.id);

    if (groupIds.length === 0) {
      return [];
    }

    // Get all approved members for all groups
    const { data: approvedMembers, error: approvedError } = await supabase
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("status", "approved");

    // Get all pending members for all groups
    const { data: pendingMembers, error: pendingError } = await supabase
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("status", "pending");

    // Create lookup maps for member counts
    const approvedCountMap = new Map();
    const pendingCountMap = new Map();

    // Count approved members per group
    if (!approvedError && approvedMembers) {
      approvedMembers.forEach((member) => {
        approvedCountMap.set(
          member.group_id,
          (approvedCountMap.get(member.group_id) || 0) + 1
        );
      });
    }

    // Count pending members per group
    if (!pendingError && pendingMembers) {
      pendingMembers.forEach((member) => {
        pendingCountMap.set(
          member.group_id,
          (pendingCountMap.get(member.group_id) || 0) + 1
        );
      });
    }

    // Add counts to groups
    const groupsWithCounts = transformedGroups.map((group) => ({
      ...group,
      memberCount: approvedCountMap.get(group.id) || 0,
      pendingCount: pendingCountMap.get(group.id) || 0,
      hasPendingRequests: pendingGroupIds.includes(group.id),
    }));

    return groupsWithCounts;
  } catch (error) {
    console.error("Error in fetchUserGroups:", error);
    throw error;
  }
}

export function GroupsList({ userId, prefetchedGroups, onGroupsFetched }: GroupsListProps) {
  const [groups, setGroups] = useState<Group[]>(prefetchedGroups || []);
  const [loading, setLoading] = useState(!prefetchedGroups);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  // NotificationsProvider removed - pending requests feature disabled
  const pendingGroupIds: string[] = [];
  
  // Add ref to prevent concurrent fetches
  const fetchingRef = useRef(false);
  
  // Memoize pendingGroupIds to prevent unnecessary re-fetches
  const stablePendingGroupIds = useMemo(() => pendingGroupIds, [JSON.stringify(pendingGroupIds)]);

  // Update groups if prefetched data changes
  useEffect(() => {
    if (prefetchedGroups) {
      setGroups(prefetchedGroups);
      setLoading(false);
    }
  }, [prefetchedGroups]);

  useEffect(() => {
    // Skip fetching if we already have prefetched data (including empty arrays)
    // null means "not yet fetched", [] means "fetched but no groups"
    if (prefetchedGroups !== null) {
      return;
    }
    
    if (fetchingRef.current) return;
    
    fetchingRef.current = true;
    
    async function loadGroups() {
      setLoading(true);
      try {
        const groupsWithCounts = await fetchUserGroups(supabase, userId, stablePendingGroupIds);
        setGroups(groupsWithCounts);
        onGroupsFetched?.(groupsWithCounts);
      } catch (error) {
        toast.error("Error", {
          description: "Failed to load groups. Please try again.",
        });
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    }

    if (userId) {
      loadGroups();
    }
  }, [userId, supabase, stablePendingGroupIds, prefetchedGroups, onGroupsFetched]);

  const handleGroupClick = (groupId: string) => {
    router.push(`/groups/${groupId}`);
  };

  const handleCreateSuccess = (newGroup: Group) => {
    setGroups((prev) => [newGroup, ...prev]);
    setShowCreateDialog(false);
    toast.success("Group Created", {
      description: "Your new group has been created successfully.",
    });
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-3">
          <GroupSkeleton />
          <GroupSkeleton />
        </div>
      ) : groups.length > 0 ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleGroupClick(group.id)}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-medium">{group.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {group.memberCount}{" "}
                        {group.memberCount === 1 ? "member" : "members"}
                      </span>
                      {group.hasPendingRequests && (
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      )}
                      {(group.pendingCount || 0) > 0 &&
                        group.created_by === userId && (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200 text-[10px] px-1.5 py-0.5 h-5">
                            {group.pendingCount} pending
                          </Badge>
                        )}
                    </div>
                    {(group.description || group.created_by === userId) && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                        {group.description}
                        {group.description &&
                          group.created_by === userId &&
                          " · "}
                        {group.created_by === userId && "Admin"}
                      </p>
                    )}
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center p-8 border rounded-lg border-dashed">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-4 text-muted-foreground"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-muted-foreground mb-4">
            You haven't joined any groups yet
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            Create Your First Group
          </Button>
        </div>
      )}

      <CreateGroupDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        userId={userId}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

function GroupSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="w-full">
            <Skeleton className="h-5 w-1/3 mb-2" />
            <Skeleton className="h-4 w-2/3 mb-3" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
