"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownIcon, ArrowUpIcon, HistoryIcon } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { formatSatsValue } from "@/lib/utils"
import { LoadingSpinner } from "@/components/loading-spinner"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { formatDistanceToNow } from "date-fns"
import type { Transaction } from "@/lib/database.types"
import { Skeleton } from "@/components/ui/skeleton"

function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const { user, profile, activeUserId } = useAuth()

  useEffect(() => {
    async function fetchTransactions() {
      if (!user || !profile) return

      const supabase = createBrowserSupabaseClient()
      
      // Fetch transactions for the current wallet owner (could be main user or active child account)
      const walletUserId = activeUserId || user.id

      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", walletUserId)
          .order("created_at", { ascending: false })
          .limit(10)

        if (error) {
          console.error("Error fetching transactions:", error)
        } else {
          setTransactions(data || [])
        }
      } catch (error) {
        console.error("Failed to fetch transactions:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [user, profile, activeUserId])

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
          <div className="text-right">
            <p
              className={`font-medium ${
                tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {tx.amount > 0 ? "+" : ""}
              {formatSatsValue(Math.abs(tx.amount))}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx.status === "completed" ? "Completed" : tx.status === "pending" ? "Pending" : "Failed"}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function WalletPage() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bitcoinPrice, setBitcoinPrice] = useState<number | null>(null)
  const [isPriceLoading, setIsPriceLoading] = useState(false)
  const bitcoinPriceFetched = useRef(false)

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
    } else if (!loading) {
      setIsLoading(false)
    }
  }, [profile, loading, user, router, fetchBitcoinPrice])

  if (isLoading) {
    return <LoadingSpinner message="Loading wallet..." />
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
      <Card className="mb-6 border dark:border-gray-800">
        <CardContent className="p-6">
          <div className="flex flex-col items-center">
            <div className="p-3 mb-3 bg-amber-100 rounded-full dark:bg-amber-950/50">
              <Image src="/images/bitcoin-logo.png" alt="Bitcoin" width={32} height={32} className="object-contain" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
            <p className="text-3xl font-bold">{formatSatsValue(balance || 0)}</p>
            <p className="text-sm text-muted-foreground mt-1 h-5">
              {!isPriceLoading && bitcoinPrice && calculateUsdValue(balance || 0) ? (
                `$${calculateUsdValue(balance || 0)} USD`
              ) : (
                <span className="opacity-0">$0.00 USD</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link href="/wallet/deposit" className="w-full">
          <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center gap-2">
            <ArrowDownIcon className="h-6 w-6 text-green-500" />
            <span>Receive</span>
          </Button>
        </Link>

        <Link href="/wallet/withdraw" className="w-full">
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

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <HistoryIcon className="h-4 w-4" />
            Transaction History
          </h3>
          <TransactionHistory />
        </CardContent>
      </Card>
    </div>
  )
}
