"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Plus, User, X } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { formatSatsValue } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import type { Profile } from "@/lib/database.types"

type AddedMember = { id: string; username: string; name: string; avatar_url: string | null }

// Long-press duration in milliseconds
const LONG_PRESS_DURATION = 500

interface FamilySectionProps {
  onAddAccount: () => void
  cachedFamilyCount?: number
  addedMember?: AddedMember | null
  embedded?: boolean // When true, removes border/container styling for embedding in profile card
}

export function FamilySection({ 
  onAddAccount, 
  cachedFamilyCount: propCachedFamilyCount = 0, 
  addedMember,
  embedded = false,
}: FamilySectionProps) {
  const { connectedAccounts, user } = useAuth()
  const router = useRouter()
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false)
  const [familyMembers, setFamilyMembers] = useState<Profile[]>([])
  const [editMode, setEditMode] = useState(false)
  const supabase = createBrowserSupabaseClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isLongPressRef = useRef(false)
  
  // Load cached family count directly from localStorage
  const [cachedFamilyCount, setCachedFamilyCount] = useState(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const userId = localStorage.getItem('ganamos_active_user_id');
      if (!userId) return 0;
      const cached = localStorage.getItem(`ganamos_family_count_${userId}`);
      if (cached) {
        const { count, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 60 * 60 * 1000) return count;
      }
    } catch (e) {}
    return 0;
  });

  // Long-press handlers for entering edit mode
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only trigger on primary button (left click / touch)
    if (e.button !== 0) return;
    
    isLongPressRef.current = false;
    
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setEditMode(true);
      // Haptic feedback on mobile if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_DURATION);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Handle click outside to exit edit mode
  useEffect(() => {
    if (!editMode) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setEditMode(false);
      }
    };

    // Add listener with a small delay to avoid immediate trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editMode]);

  // Fetch family_members (quick contacts added via Find by Username or QR scan)
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      if (!user) return
      
      const { data, error } = await supabase
        .from('family_members')
        .select('member_id, profiles!family_members_member_id_fkey(*)')
        .eq('user_id', user.id)
      
      if (error) {
        console.error('Error fetching family members:', error)
        return
      }
      
      // Extract the profile data from the joined query
      const members = data
        ?.map((row: any) => row.profiles)
        .filter((profile: Profile | null) => profile !== null) as Profile[]
      
      setFamilyMembers(members || [])
    }
    
    fetchFamilyMembers()
  }, [user, supabase])

  // Immediately add new member when addedMember changes
  useEffect(() => {
    if (addedMember && !familyMembers.some(m => m.id === addedMember.id)) {
      // Convert AddedMember to Profile shape (with defaults for missing fields)
      // Use -1 as sentinel value to indicate "balance not yet loaded"
      const newMember: Profile = {
        id: addedMember.id,
        username: addedMember.username,
        name: addedMember.name,
        avatar_url: addedMember.avatar_url,
        lightning_address: null,
        balance: -1,
        email: "",
        pet_coins: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        fixed_issues_count: 0,
      }
      setFamilyMembers(prev => [...prev, newMember])
    }
  }, [addedMember])
  
  // Track when accounts have been loaded at least once
  // Set to true when we have accounts OR after 800ms (to handle no-accounts case)
  useEffect(() => {
    const totalCount = (connectedAccounts?.length || 0) + familyMembers.length
    if (totalCount > 0) {
      setHasLoadedAccounts(true)
      // Update cached count when real accounts load
      if (cachedFamilyCount === 0) {
        setCachedFamilyCount(totalCount);
      }
    } else if (connectedAccounts) {
      // If connectedAccounts exists but is empty, wait before showing Add button
      const timer = setTimeout(() => {
        setHasLoadedAccounts(true)
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [connectedAccounts, familyMembers, cachedFamilyCount])

  // Handle child account tap - navigate to send sats page (unless in edit mode or long-press)
  const handleChildAccountTap = (childAccount: Profile) => {
    // Don't navigate if in edit mode
    if (editMode) return;
    // Don't navigate if this was a long-press (which just entered edit mode)
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    router.push(`/wallet/withdraw?recipient=${childAccount.id}`)
  }

  // Handle remove family member
  const handleRemoveMember = async (member: Profile, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent button click
    
    const memberName = member.name?.split(' ')[0] || 'this member';
    
    // Show confirmation toast
    toast(`Remove ${memberName} from family?`, {
      action: {
        label: 'Remove',
        onClick: async () => {
          try {
            // Delete from family_members table
            const { error } = await supabase
              .from('family_members')
              .delete()
              .eq('user_id', user?.id)
              .eq('member_id', member.id);
            
            if (error) {
              console.error('Error removing family member:', error);
              toast.error('Failed to remove family member');
              return;
            }
            
            // Remove from local state
            setFamilyMembers(prev => prev.filter(m => m.id !== member.id));
            toast.success(`${memberName} removed from family`);
          } catch (err) {
            console.error('Error removing family member:', err);
            toast.error('Failed to remove family member');
          }
        },
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {},
      },
    });
  };

  // Format balance with k for thousands
  const formatBalance = (balance: number): string => {
    if (balance >= 1000) {
      return `${Math.floor(balance / 1000)}k`
    }
    return balance.toLocaleString()
  }

  // Combine connected accounts (child accounts) with family members (quick contacts)
  // Deduplicate by ID in case someone appears in both lists
  const getAccountsToShow = () => {
    const connected = (connectedAccounts || []).filter(account => account !== null)
    const members = familyMembers.filter(member => member !== null)
    
    // Use a Map to deduplicate by ID
    const accountMap = new Map<string, Profile>()
    connected.forEach(account => accountMap.set(account.id, account))
    members.forEach(member => {
      if (!accountMap.has(member.id)) {
        accountMap.set(member.id, member)
      }
    })
    
    return Array.from(accountMap.values())
  }

  // Sort accounts by balance (high to low)
  const sortedAccounts = getAccountsToShow()
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))

  // Only show Add button after accounts have loaded (and not in edit mode)
  const showAddButton = hasLoadedAccounts && !editMode;

  // Empty state: show centered "Add family members" tile
  const isEmpty = sortedAccounts.length === 0;

  return (    
    <div 
      ref={containerRef}
      className={`transition-colors ${
        embedded 
          ? 'mt-4' // Minimal styling when embedded in profile card
          : 'mt-4 mb-4 p-4 border rounded-lg' // Full standalone styling
      } ${
        editMode 
          ? 'border-red-500/50 dark:border-red-500/50 bg-red-500/5' 
          : embedded ? '' : 'dark:border-gray-800'
      }`}
    >
      {editMode && (
        <div className="text-xs text-red-500 mb-3 text-center">
          Tap the X to remove • Tap outside to exit
        </div>
      )}
      <div className="grid grid-cols-4 gap-y-4">
        {sortedAccounts.map((account) => (
          <button
            key={account.id}
            onClick={() => handleChildAccountTap(account)}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerCancel}
            className={`relative flex flex-col items-center space-y-2 p-2 rounded-lg transition-colors focus:outline-none animate-in fade-in duration-500 touch-manipulation select-none ${
              editMode 
                ? 'cursor-default' 
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {/* Remove button - only in edit mode */}
            {editMode && (
              <div
                onClick={(e) => handleRemoveMember(account, e)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors animate-in zoom-in duration-200 z-10"
              >
                <X className="h-3 w-3 text-white" />
              </div>
            )}
            
            {/* Avatar */}
            <Avatar className={`w-12 h-12 ${editMode ? 'animate-pulse' : ''}`}>
              <AvatarImage 
                src={account.avatar_url ?? undefined} 
                alt={account.name || "Family member"}
                className="object-cover transition-opacity duration-300"
              />
              <AvatarFallback>
                <User className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            
            {/* Name */}
            <div className="text-sm font-medium text-center truncate w-full">
              {account.name?.split(' ')[0] || 'Child'}
            </div>
            
            {/* Balance - only show when loaded (not -1 sentinel value) */}
            {account.balance >= 0 && (
              <div className="flex items-center space-x-1 text-xs text-gray-600 dark:text-gray-400">
                <div className="w-3 h-3 relative">
                  <Image
                    src="/images/bitcoin-logo.png"
                    alt="Bitcoin"
                    fill
                    className="object-contain"
                  />
                </div>
                <span>{formatBalance(account.balance)}</span>
              </div>
            )}
            {account.balance < 0 && <div className="h-4"></div>}
          </button>
        ))}
        
        {/* Add Family Member Button - hide during initial load if we expect family members, also hide in edit mode */}
        {showAddButton && (
          <button
            onClick={onAddAccount}
            className="flex flex-col items-center space-y-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus:outline-none"
          >
            {/* Dotted Circle with Plus */}
            <div className="relative w-12 h-12 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center">
              <Plus className="h-5 w-5 text-gray-400 dark:text-gray-600" />
            </div>
            
            {/* Add text */}
            <div className="text-sm font-medium text-center text-gray-500 dark:text-gray-500">
              Add
            </div>
            
            {/* Empty space for balance alignment */}
            <div className="h-4"></div>
          </button>
        )}

        {/* Show message if in edit mode with no members */}
        {editMode && sortedAccounts.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 w-full">
            No family members to edit
          </div>
        )}
      </div>
    </div>
  )
}
