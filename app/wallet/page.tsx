"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownIcon, ArrowUpIcon, HistoryIcon, MoreVertical, Wallet, Zap, Unlink } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { formatSatsValue } from "@/lib/utils"
import { LoadingSpinner } from "@/components/loading-spinner"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { formatDistanceToNow } from "date-fns"
import type { Transaction } from "@/lib/database.types"
import { Skeleton } from "@/components/ui/skeleton"
import { WalletConnectBanner } from "@/components/wallet-connect-banner"
import { WalletConnectionModal } from "@/components/wallet-connection-modal"
import { ConnectedWalletCard } from "@/components/connected-wallet-card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const { user, profile, activeUserId } = useAuth()
  const observerTarget = useRef<HTMLDivElement>(null)
  const TRANSACTIONS_PER_PAGE = 10

  const fetchTransactions = useCallback(async (pageNum: number, append: boolean = false) => {
    if (!user || !profile) return

    const supabase = createBrowserSupabaseClient()
    
    // Fetch transactions for the current wallet owner (could be main user or active child account)
    const walletUserId = activeUserId || user.id
    const offset = pageNum * TRANSACTIONS_PER_PAGE

    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", walletUserId)
        .order("created_at", { ascending: false })
        .range(offset, offset + TRANSACTIONS_PER_PAGE - 1)

      if (error) {
        console.error("Error fetching transactions:", error)
      } else {
        const newTransactions = data || []
        if (append) {
          setTransactions(prev => [...prev, ...newTransactions])
        } else {
          setTransactions(newTransactions)
        }
        setHasMore(newTransactions.length === TRANSACTIONS_PER_PAGE)
      }
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }, [user, profile, activeUserId])

  useEffect(() => {
    fetchTransactions(0, false)
  }, [fetchTransactions])

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !loading) {
          setIsLoadingMore(true)
          const nextPage = page + 1
          setPage(nextPage)
          fetchTransactions(nextPage, true)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, isLoadingMore, loading, page, fetchTransactions])

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="text-right space-y-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>No transactions yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                tx.amount > 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
              }`}
            >
              {tx.amount > 0 ? (
                <ArrowDownIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowUpIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div>
              <p className="font-medium">
                {tx.type === "internal" 
                  ? (tx.amount > 0 ? "Received" : "Sent")
                  : (tx.type === "deposit" ? "Deposit" : "Withdrawal")
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {tx.memo || (tx.created_at && formatDistanceToNow(new Date(tx.created_at), { addSuffix: true }))}
              </p>
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <p
              className={`font-medium ${
                tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {tx.amount > 0 ? "+" : ""}
              {formatSatsValue(Math.abs(tx.amount)).replace(" sats", "")}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx.status === "completed" ? "Completed" : tx.status === "pending" ? "Pending" : "Failed"}
            </p>
          </div>
        </div>
      ))}
      {/* Intersection Observer target */}
      {hasMore && <div ref={observerTarget} className="h-10" />}
      {/* Loading indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading more...
          </div>
        </div>
      )}
    </div>
  )
}

// Types for NWC wallet status
interface NWCWalletInfo {
  id: string
  name: string
  relayUrl?: string
  status: string
  lastConnected?: string
}

interface NWCStatus {
  hasNWCWallet: boolean
  wallet: NWCWalletInfo | null
  custodialBalance: number
  promptDismissed: boolean
}

export default function WalletPage() {
  const router = useRouter()
  const { user, profile, loading, refreshProfile } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  const [isPriceLoading, setIsPriceLoading] = useState(false)
  const bitcoinPriceFetched = useRef(false)
  
  // NWC wallet state
  const [nwcStatus, setNwcStatus] = useState<NWCStatus | null>(null)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  // Fetch NWC wallet status
  const fetchNWCStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet/nwc/status")
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setNwcStatus({
            hasNWCWallet: data.hasNWCWallet,
            wallet: data.wallet,
            custodialBalance: data.custodialBalance,
            promptDismissed: data.promptDismissed,
          })
          // Show banner if no NWC wallet and not dismissed
          setShowBanner(!data.hasNWCWallet && !data.promptDismissed)
        }
      }
    } catch (error) {
      console.error("Failed to fetch NWC status:", error)
    }
  }, [])

  // Fetch the current Bitcoin price
  const fetchBitcoinPrice = useCallback(async () => {
    if (bitcoinPriceFetched.current) return;

    try {
      setIsPriceLoading(true);

      const response = await fetch("/api/bitcoin-price");
      
      if (response.ok) {
        const data = await response.json();
        if (data.price && typeof data.price === 'number') {
          setBitcoinPrice(data.price);
          bitcoinPriceFetched.current = true;
        } else {
          console.warn("Bitcoin price API returned invalid price data");
          setBitcoinPrice(null);
        }
      } else {
        console.warn("Bitcoin price API request failed");
        setBitcoinPrice(null);
      }
    } catch (error) {
      console.warn("Failed to fetch Bitcoin price:", error);
      setBitcoinPrice(null);
    } finally {
      setIsPriceLoading(false);
    }
  }, []);

  // Calculate USD value from satoshis
  const calculateUsdValue = (sats: number) => {
    if (!bitcoinPrice) return null;
    const btcAmount = sats / 100000000;
    const usdValue = btcAmount * bitcoinPrice;
    return usdValue.toFixed(2);
  };

  // Handle wallet connection success
  const handleWalletConnected = () => {
    fetchNWCStatus()
    setShowBanner(false)
  }

  // Handle wallet disconnection
  const handleWalletDisconnected = () => {
    fetchNWCStatus()
  }

  // Handle banner dismissal
  const handleBannerDismiss = () => {
    setShowBanner(false)
  }

  useEffect(() => {
    // Check if user is authenticated
    if (!loading && !user) {
      router.push("/auth/login?redirect=/wallet")
      return
    }

    if (profile) {
      setBalance(profile.balance)
      setIsLoading(false)
      // Fetch Bitcoin price when profile is loaded
      fetchBitcoinPrice()
      // Fetch NWC status
      fetchNWCStatus()
    } else if (!loading) {
      setIsLoading(false)
    }
  }, [profile, loading, user, router, fetchBitcoinPrice, fetchNWCStatus])

  if (isLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  // If not authenticated, show login prompt
  if (!user) {
    return (
      <div className="container max-w-md mx-auto pt-6 px-4">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Bitcoin Wallet</h1>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-muted-foreground mb-6">Please sign in to access your wallet</p>
              <Button onClick={() => router.push("/auth/login?redirect=/wallet")}>Sign In</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container max-w-md mx-auto pt-6 px-4">
      {/* Connected wallet card */}
      {nwcStatus?.hasNWCWallet && nwcStatus.wallet && (
        <ConnectedWalletCard
          wallet={nwcStatus.wallet}
          onDisconnect={handleWalletDisconnected}
        />
      )}

      {/* Balance Card */}
      <Card className="mb-6 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card">
        <CardContent className="p-6 relative">
          {/* Menu at top right - only show when banner is dismissed */}
          {nwcStatus?.promptDismissed && (
            <div className="absolute top-2 right-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {nwcStatus?.hasNWCWallet ? (
                    <>
                      <DropdownMenuItem className="text-muted-foreground" disabled>
                        <Wallet className="h-4 w-4 mr-2" />
                        {nwcStatus.wallet?.name || "Connected Wallet"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setShowConnectionModal(true)}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Change Wallet
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem 
                      onClick={() => setShowConnectionModal(true)}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Connect Lightning Wallet
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="flex flex-col items-center">
            <div className="p-3 mb-3 bg-amber-100 rounded-full dark:bg-amber-950/50">
              <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={32} height={32} className="object-contain" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {nwcStatus?.hasNWCWallet ? "Ganamos Balance" : "Current Balance"}
            </p>
            <p className="text-3xl font-bold" data-testid="wallet-balance">{formatSatsValue(balance || 0)}</p>
            <p className="text-sm text-muted-foreground mt-1 h-5">
              {!isPriceLoading && bitcoinPrice && calculateUsdValue(balance || 0) ? (
                `$${calculateUsdValue(balance || 0)} USD`
              ) : (
                <span className="opacity-0">$0.00 USD</span>
              )}
            </p>
            {nwcStatus?.hasNWCWallet && (
              <p className="text-xs text-muted-foreground mt-2">
                Payments will use your connected wallet
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link href="/wallet/deposit" className="w-full" data-testid="deposit-button">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-2">
            <ArrowDownIcon className="h-6 w-6 text-green-500" />
            <span>Receive</span>
          </Button>
        </Link>

        <Link href="/wallet/withdraw" className="w-full" data-testid="withdraw-button">
          <Button
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2"
            onClick={() => router.push("/wallet/withdraw")}
          >
            <ArrowUpIcon className="h-6 w-6 text-red-500" />
            <span>Send</span>
          </Button>
        </Link>
      </div>

      {/* Connect wallet banner - below Send/Receive buttons */}
      {showBanner && (
        <WalletConnectBanner
          onConnect={() => setShowConnectionModal(true)}
          onDismiss={handleBannerDismiss}
        />
      )}

      <Card className="shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_12px_rgba(255,255,255,0.03),0_1px_3px_rgba(255,255,255,0.06)] rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-card">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <HistoryIcon className="h-4 w-4" />
            Transaction History
          </h3>
          <TransactionHistory />
        </CardContent>
      </Card>

      {/* Wallet Connection Modal */}
      <WalletConnectionModal
        open={showConnectionModal}
        onOpenChange={setShowConnectionModal}
        onConnected={handleWalletConnected}
      />
    </div>
  )
}
