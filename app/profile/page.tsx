"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import { AvatarSelector } from "@/components/avatar-selector";
import { FamilySection } from "@/components/family-section";
import { UserQRModal } from "@/components/user-qr-modal";
import type { Group } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddConnectedAccountDialog } from "@/components/add-connected-account-dialog";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { 
  Settings, 
  Users, 
  Activity, 
  Camera, 
  ChevronRight, 
  Cat, 
  Dog, 
  Rabbit, 
  Squirrel, 
  Turtle,
  X,
  Shield
} from "lucide-react";
import { OwlIcon } from "@/components/icons/owl-icon";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import QRCode from "@/components/qr-code";

export default function ProfilePage() {
  const {
    user,
    profile,
    mainAccountProfile,
    loading,
    session,
    sessionLoaded,
    signOut,
    isConnectedAccount,
    switchToAccount,
    resetToMainAccount,
    connectedAccounts,
    fetchConnectedAccounts,
    activeUserId,
    updateProfile,
  } = useAuth();
  
  const router = useRouter();
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [postedIssuesCount, setPostedIssuesCount] = useState<number>(0);
  const [fixedIssuesCount, setFixedIssuesCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(CACHE_KEYS.BITCOIN_PRICE);
      if (cached) {
        const { price, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) return price;
      }
    } catch (e) {}
    return null;
  });
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  const [addedFamilyMember, setAddedFamilyMember] = useState<{ id: string; username: string; name: string; avatar_url: string | null } | null>(null);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [accountToManage, setAccountToManage] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<any[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(true);
  const [isRemoveMode, setIsRemoveMode] = useState(false);

  // Cache keys for localStorage
  const CACHE_KEYS = {
    BITCOIN_PRICE: 'ganamos_bitcoin_price',
    BALANCE: 'ganamos_balance',
    AVATAR: 'ganamos_avatar',
    PET: 'ganamos_pet',
    CONNECTED_ACCOUNTS: 'ganamos_connected_accounts',
    FAMILY_COUNT: 'ganamos_family_count',
  };

  // Helper function to get pet icon
  const getPetIcon = (petType: string, size: number = 24) => {
    const iconProps = { size, className: "text-white" }
    switch (petType) {
      case 'dog': return <Dog {...iconProps} />
      case 'rabbit': return <Rabbit {...iconProps} />
      case 'squirrel': return <Squirrel {...iconProps} />
      case 'turtle': return <Turtle {...iconProps} />
      case 'owl': return <OwlIcon size={size} color="white" />
      default: return <Cat {...iconProps} />
    }
  };

  // Helper function to format balance with k notation
  const formatBalanceWithK = (balance: number) => {
    if (balance >= 100000) {
      return Math.floor(balance / 1000) + 'k';
    } else if (balance > 999) {
      return (balance / 1000).toFixed(1) + 'k';
    }
    return balance.toString();
  };

  // Cached data for instant display
  const [cachedBalance, setCachedBalance] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const userId = localStorage.getItem('ganamos_active_user_id');
      if (!userId) return null;
      const cached = localStorage.getItem(`${CACHE_KEYS.BALANCE}_${userId}`);
      if (cached) {
        const { balance, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 60 * 60 * 1000) return balance;
      }
    } catch (e) {}
    return null;
  });
  
  const [cachedAvatar, setCachedAvatar] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const userId = localStorage.getItem('ganamos_active_user_id');
      if (!userId) return null;
      return localStorage.getItem(`${CACHE_KEYS.AVATAR}_${userId}`);
    } catch (e) {}
    return null;
  });
  
  const [cachedPet, setCachedPet] = useState<any>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const userId = localStorage.getItem('ganamos_active_user_id');
      if (!userId) return null;
      const cached = localStorage.getItem(`${CACHE_KEYS.PET}_${userId}`);
      if (cached) {
        const { pet, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 60 * 60 * 1000) return pet;
      }
    } catch (e) {}
    return null;
  });
  
  const [cachedHasConnectedAccounts, setCachedHasConnectedAccounts] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const userId = localStorage.getItem('ganamos_active_user_id');
      if (!userId) return false;
      return localStorage.getItem(`${CACHE_KEYS.CONNECTED_ACCOUNTS}_${userId}`) === 'true';
    } catch (e) {}
    return false;
  });

  const [cachedFamilyCount, setCachedFamilyCount] = useState(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const userId = localStorage.getItem('ganamos_active_user_id');
      if (!userId) return 0;
      const cached = localStorage.getItem(`${CACHE_KEYS.FAMILY_COUNT}_${userId}`);
      if (cached) {
        const { count, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 60 * 60 * 1000) return count;
      }
    } catch (e) {}
    return 0;
  });

  // Calculate USD value
  const calculateUsdValue = (sats: number): string | null => {
    if (!bitcoinPrice || sats === 0) return null;
    const usdValue = (sats / 100000000) * bitcoinPrice;
    // Round to nearest dollar (no decimals)
    return Math.round(usdValue).toString();
  };

  // Fetch Bitcoin price
  useEffect(() => {
    const fetchBitcoinPrice = async () => {
      try {
        const response = await fetch("/api/bitcoin-price");
        const data = await response.json();
        if (data.price) {
          setBitcoinPrice(data.price);
          localStorage.setItem(
            CACHE_KEYS.BITCOIN_PRICE,
            JSON.stringify({ price: data.price, timestamp: Date.now() })
          );
      }
    } catch (error) {
        console.error("Failed to fetch bitcoin price:", error);
      }
    };
    
    if (!bitcoinPrice) {
      fetchBitcoinPrice();
    }
  }, [bitcoinPrice, CACHE_KEYS.BITCOIN_PRICE]);

  // Fetch connected devices (pets)
  // Use profile?.id because activeUserId is null for the main account
  const targetUserId = activeUserId || profile?.id;
  
  useEffect(() => {
    const fetchDevices = async () => {
      if (!targetUserId) return;
      
      setIsDevicesLoading(true);
      try {
        const response = await fetch(`/api/device/list?activeUserId=${targetUserId}`);
        const data = await response.json();
        if (data.devices) {
          setConnectedDevices(data.devices);
          // Cache pet info
          if (data.devices.length > 0) {
            const petData = { 
              pet_type: data.devices[0].pet_type, 
              pet_name: data.devices[0].pet_name 
            };
            localStorage.setItem(
              `${CACHE_KEYS.PET}_${targetUserId}`,
              JSON.stringify({ pet: petData, timestamp: Date.now() })
            );
            setCachedPet(petData);
          }
      }
    } catch (error) {
        console.error("Failed to fetch devices:", error);
    } finally {
        setIsDevicesLoading(false);
      }
    };
    
    fetchDevices();
  }, [targetUserId, CACHE_KEYS.PET]);

  // Fetch posts count - use profile.id directly since profile is already loaded
  useEffect(() => {
    const fetchPostsCount = async () => {
      if (!profile?.id) return;
      
      try {
        // Fetch posts created by user
        const { data: posted, error: postedError } = await supabase
          .from("posts")
          .select("id")
          .eq("user_id", profile.id)
          .is("deleted_at", null);
        
        // Fetch posts fixed by user  
        const { data: fixed, error: fixedError } = await supabase
          .from("posts")
          .select("id")
          .eq("fixed_by", profile.id)
          .is("deleted_at", null);
        
        if (!postedError && posted) {
          setPostedIssuesCount(posted.length);
        }
        if (!fixedError && fixed) {
          setFixedIssuesCount(fixed.length);
        }
      } catch (error) {
        console.error("Failed to fetch posts count:", error);
      }
    };
    
    fetchPostsCount();
  }, [profile?.id, supabase]);

  // Cache balance and avatar when profile changes
  useEffect(() => {
    if (profile && activeUserId) {
      // Cache balance
      localStorage.setItem(
        `${CACHE_KEYS.BALANCE}_${activeUserId}`,
        JSON.stringify({ balance: profile.balance, timestamp: Date.now() })
      );
      setCachedBalance(profile.balance);
      
      // Cache avatar
      if (profile.avatar_url) {
        localStorage.setItem(`${CACHE_KEYS.AVATAR}_${activeUserId}`, profile.avatar_url);
        setCachedAvatar(profile.avatar_url);
      }
    }
  }, [profile, activeUserId, CACHE_KEYS.BALANCE, CACHE_KEYS.AVATAR]);

  // Cache connected accounts state
  useEffect(() => {
    if (activeUserId) {
      const hasConnected = connectedAccounts.length > 0;
      localStorage.setItem(`${CACHE_KEYS.CONNECTED_ACCOUNTS}_${activeUserId}`, hasConnected.toString());
      setCachedHasConnectedAccounts(hasConnected);
    }
  }, [connectedAccounts, activeUserId, CACHE_KEYS.CONNECTED_ACCOUNTS]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/auth/login");
    }
  }, [sessionLoaded, session, router]);

  // Handle account actions
  const handleAccountAction = (account: any) => {
    setAccountToManage(account);
    if (account.email?.endsWith("@ganamos.app")) {
      setShowDeleteDialog(true);
    } else {
      setShowDisconnectDialog(true);
    }
  };

  // Handle disconnect account
  const handleDisconnectAccount = async () => {
    if (!accountToManage || !user) return;

    setIsProcessing(true);

    try {
      const response = await fetch("/api/disconnect-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId: accountToManage.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to disconnect account");
      }

      fetchConnectedAccounts();
      toast.success("Account disconnected", {
        description: `${accountToManage.name} has been removed from your connected accounts.`,
      });
      setShowDisconnectDialog(false);
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to disconnect account. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle delete child account
  const handleDeleteChildAccount = async () => {
    if (!accountToManage || !user) return;

    setIsProcessing(true);

    try {
      const response = await fetch("/api/delete-child-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childAccountId: accountToManage.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to delete child account");
      }

      const wasCurrentlyViewingDeletedAccount = isConnectedAccount && profile?.id === accountToManage.id;
      
      if (wasCurrentlyViewingDeletedAccount) {
        await resetToMainAccount();
      }

      fetchConnectedAccounts();
      toast.success("Account deleted", {
        description: `${accountToManage.name}'s account has been permanently deleted.`,
      });
      setShowDeleteDialog(false);
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to delete child account. Please try again.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Session guard with early return
  if (sessionLoaded && !session) {
    return null;
  }

  if (loading || !user || !profile) {
    return (
      <div className="container px-4 pt-6 mx-auto max-w-md">
        <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  const hasPet = connectedDevices.length > 0 || cachedPet;

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      <div className="container px-4 pt-6 mx-auto max-w-md pb-24">
        
        {/* Profile Card - Airbnb Style */}
        <Card className="mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.12),0_8px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_20px_rgba(255,255,255,0.05),0_2px_6px_rgba(255,255,255,0.08)] transition-shadow rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card overflow-hidden">
          <CardContent className="px-5 py-8">
            <div className="flex items-center gap-3">
              {/* Left side: Avatar + Name */}
              <div className="flex-[0.85] flex flex-col items-center">
                {/* Avatar with QR Badge - Larger like Airbnb */}
                <div className="relative">
                  <div
                    className="w-28 h-28 rounded-full overflow-hidden cursor-pointer border-[3px] border-gray-200 dark:border-gray-600 shadow-lg"
                onClick={() => setShowAvatarSelector(true)}
              >
                <Image
                      src={profile.avatar_url || cachedAvatar || "/placeholder.svg?height=112&width=112"}
                  alt={profile.name || "User"}
                      width={112}
                      height={112}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  {/* QR Code Badge - Green background with white QR */}
                  <button
                    onClick={() => setShowQrDialog(true)}
                    className="absolute bottom-0 right-0 w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-[3px] border-white dark:border-gray-800 hover:bg-emerald-600 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="3" height="3" />
                      <rect x="18" y="14" width="3" height="3" />
                      <rect x="14" y="18" width="3" height="3" />
                      <rect x="18" y="18" width="3" height="3" />
                  </svg>
                  </button>
                </div>
                
                {/* Name + Username below avatar */}
                <div className="mt-4 text-center">
                  <div className="flex items-center gap-1 justify-center">
                    {/* Account Switcher */}
                {(connectedAccounts.length > 0 || cachedHasConnectedAccounts) ? (
                      <DropdownMenu onOpenChange={(open) => { if (!open) setIsRemoveMode(false); }}>
                    <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1 focus:outline-none">
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">
                              {profile.name?.split(' ')[0] || profile.name}
                            </span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 mt-1">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-64 p-2">
                      {/* Primary Account */}
                      <DropdownMenuItem
                            onClick={() => !isConnectedAccount ? null : resetToMainAccount()}
                            className={`p-3 ${!isConnectedAccount ? "bg-muted" : "cursor-pointer"}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center">
                            <div className="w-6 h-6 mr-2 overflow-hidden rounded-full">
                              <Image
                                    src={mainAccountProfile?.avatar_url || "/placeholder.svg?height=24&width=24"}
                                    alt={mainAccountProfile?.name || "Main Account"}
                                width={24}
                                height={24}
                                className="object-cover"
                              />
                            </div>
                                <span>{mainAccountProfile?.name?.split(' ')[0] || "Main Account"} (You)</span>
                          </div>
                          {!isConnectedAccount && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </div>
                      </DropdownMenuItem>

                      {/* Connected Accounts */}
                          {connectedAccounts.filter(a => a !== null).map((account) => (
                        <DropdownMenuItem
                          key={account.id}
                              onClick={() => isConnectedAccount && profile?.id === account.id ? null : switchToAccount(account.id)}
                              className={`p-3 ${isConnectedAccount && profile?.id === account.id ? "bg-muted" : "cursor-pointer"}`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center">
                              <div className="w-6 h-6 mr-2 overflow-hidden rounded-full">
                                <Image
                                      src={account.avatar_url || "/placeholder.svg?height=24&width=24"}
                                  alt={account.name || "Account"}
                                  width={24}
                                  height={24}
                                  className="object-cover"
                                />
                              </div>
                              <span>{account.name}</span>
                            </div>
                            <div className="flex items-center">
                                  {isConnectedAccount && profile?.id === account.id && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 6 9 17l-5-5" />
                                  </svg>
                                )}
                              {isRemoveMode && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={(e) => { e.stopPropagation(); handleAccountAction(account); }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      ))}

                      <DropdownMenuSeparator />

                          <DropdownMenuItem onClick={() => setShowAddAccountDialog(true)} className="p-3">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <line x1="19" y1="8" x2="19" y2="14" />
                          <line x1="22" y1="11" x2="16" y2="11" />
                        </svg>
                        Add Account
                      </DropdownMenuItem>

                      {connectedAccounts.length > 0 && (
                        <DropdownMenuItem
                              onSelect={(e) => { e.preventDefault(); setIsRemoveMode(!isRemoveMode); }}
                              className="p-3 cursor-pointer"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2 text-muted-foreground">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <line x1="22" y1="11" x2="16" y2="11" />
                          </svg>
                              <span className={`text-muted-foreground ${isRemoveMode ? "font-bold" : ""}`}>
                            Remove Account
                          </span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {profile.name?.split(' ')[0] || profile.name}
                      </span>
                          )}
                        </div>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                    @{profile.username || "username"}
                  </p>
                        </div>
                        </div>
              
              {/* Right side: Stats - Airbnb style */}
              <div className="flex flex-col justify-center" style={{ width: '130px' }}>
                {/* Balance - Clickable to open wallet */}
                <div 
                  className="pb-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => router.push("/wallet")}
                >
                  <div className="flex items-baseline gap-1">
                    <div className="w-4 h-4 relative flex-shrink-0">
                        <Image
                          src="/images/bitcoin-logo.png"
                          alt="Bitcoin"
                          width={16}
                          height={16}
                          className="object-contain"
                        />
                      </div>
                    <span className="text-[22px] font-bold text-gray-900 dark:text-white leading-none">
                        {formatBalanceWithK(profile?.balance ?? cachedBalance ?? 0)}
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500 font-normal">
                      ${(() => {
                        const sats = profile?.balance ?? cachedBalance ?? 0;
                        const price = bitcoinPrice || 100000;
                        const usd = (sats / 100000000) * price;
                        return Math.round(usd);
                      })()}
                    </span>
                    </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Balance</p>
                </div>
                
                {/* Fixes & Posts Row */}
                <div className="py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-6">
                  <div>
                    <p className="text-[22px] font-bold text-gray-900 dark:text-white leading-none">
                      {profile?.fixed_issues_count || fixedIssuesCount || 0}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Fixes</p>
                  </div>
                  <div>
                    <p className="text-[22px] font-bold text-gray-900 dark:text-white leading-none">
                      {postedIssuesCount}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Posts</p>
                  </div>
                </div>
                
                {/* Connect Pet Row */}
                <div 
                  className="pt-3 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => hasPet ? router.push('/pet-settings') : router.push('/connect-pet')}
                >
                  {hasPet ? (
                    <div className="w-7 h-7 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
                      {getPetIcon((connectedDevices[0]?.pet_type || cachedPet?.pet_type), 16)}
                    </div>
                  ) : (
                    <div className="w-7 h-7 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                      <Cat size={16} className="text-gray-500 dark:text-gray-400" />
                    </div>
                  )}
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {hasPet ? (connectedDevices[0]?.pet_name || cachedPet?.pet_name || "Pet") : "Connect Pet"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Family Section Card */}
        <Card className="mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.12),0_8px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_20px_rgba(255,255,255,0.05),0_2px_6px_rgba(255,255,255,0.08)] transition-shadow rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card">
          <CardContent className="p-4">
          <FamilySection 
            onAddAccount={() => setShowAddAccountDialog(true)} 
            cachedFamilyCount={cachedFamilyCount}
            addedMember={addedFamilyMember}
            embedded={true}
          />
        </CardContent>
      </Card>

        {/* Menu List - Airbnb Style (no card, no dividers) */}
        <div className="mt-4 space-y-1 max-w-[360px] mx-auto">
          {/* Account Settings */}
          <Link href="/profile/settings">
            <div className="flex items-center justify-between py-4 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer rounded-lg">
              <div className="flex items-center gap-4">
                <Settings className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <span className="text-[15px] text-gray-900 dark:text-white">Account settings</span>
                      </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
                          </div>
          </Link>

          {/* Groups */}
          <Link href="/profile/groups">
            <div className="flex items-center justify-between py-4 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer rounded-lg">
              <div className="flex items-center gap-4">
                <Users className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <span className="text-[15px] text-gray-900 dark:text-white">Groups</span>
                        </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
          </Link>

          {/* Activity */}
          <Link href="/profile/activity">
            <div className="flex items-center justify-between py-4 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer rounded-lg">
              <div className="flex items-center gap-4">
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                <span className="text-[15px] text-gray-900 dark:text-white">Activity</span>
                      </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
          </Link>

          {/* Posts */}
          <Link href="/profile/posts">
            <div className="flex items-center justify-between py-4 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer rounded-lg">
              <div className="flex items-center gap-4">
                <Camera className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <span className="text-[15px] text-gray-900 dark:text-white">Posts</span>
            </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </Link>

          {/* Admin (only for admin user) */}
          {user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
            <Link href="/admin">
              <div className="flex items-center justify-between py-4 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer rounded-lg">
                <div className="flex items-center gap-4">
                  <Shield className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                  <span className="text-[15px] text-gray-900 dark:text-white">Admin</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          )}

          {/* Log out */}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer rounded-lg"
          >
            <div className="flex items-center gap-4">
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="text-[15px] text-gray-900 dark:text-white">Log out</span>
          </div>
          </button>
          
          {/* Spacer for bottom nav */}
          <div className="h-16" />
        </div>

        {/* Dialogs */}
      <AvatarSelector
        isOpen={showAvatarSelector}
        onOpenChange={setShowAvatarSelector}
      />
        
      <AddConnectedAccountDialog
        open={showAddAccountDialog}
        onOpenChange={setShowAddAccountDialog}
        onAccountAdded={(addedProfile) => {
          fetchConnectedAccounts();
          if (addedProfile) {
            setAddedFamilyMember(addedProfile);
          }
        }}
      />
        
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

      {/* Delete Child Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="rounded-2xl">
          <DialogHeader>
              <DialogTitle className="text-destructive">Delete Child Account</DialogTitle>
            <DialogDescription>
                This will permanently delete {accountToManage?.name}'s account and all their data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
              <Button variant="destructive" onClick={handleDeleteChildAccount} disabled={isProcessing}>
                {isProcessing ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect Account Dialog */}
        <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Disconnect Account</DialogTitle>
            <DialogDescription>
                This will remove {accountToManage?.name} from your connected accounts. They will still have their own account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowDisconnectDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleDisconnectAccount} disabled={isProcessing}>
                {isProcessing ? "Disconnecting..." : "Disconnect Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User QR Code Modal */}
        <UserQRModal open={showQrDialog} onOpenChange={setShowQrDialog} />
    </div>
                  </div>
  );
}
