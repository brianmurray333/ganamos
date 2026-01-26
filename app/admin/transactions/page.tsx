"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  CreditCard,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  User,
  Hash,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Globe,
  Monitor,
} from "lucide-react"
import { searchTransactions } from "@/app/actions/admin-actions"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"

interface TransactionResult {
  id: string
  type: string
  amount: number
  status: string
  created_at: string
  user_id: string
  payment_hash?: string
  memo?: string
  requires_approval?: boolean
  ip_address?: string
  user_agent?: string
  profiles?: {
    email?: string
    name?: string
  }
}

const ITEMS_PER_PAGE = 20

export default function AdminTransactionsPage() {
  const searchParams = useSearchParams()
  const approveId = searchParams.get('approve')
  
  const [searchQuery, setSearchQuery] = useState("")
  const [transactions, setTransactions] = useState<TransactionResult[]>([])
  const [allTransactions, setAllTransactions] = useState<TransactionResult[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<TransactionResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionResult | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  
  const supabase = createBrowserSupabaseClient()

  // Load pending approvals
  useEffect(() => {
    const loadPendingApprovals = async () => {
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select(`
            id, type, amount, status, created_at, user_id, payment_hash, memo,
            requires_approval, ip_address, user_agent,
            profiles:user_id (email, name)
          `)
          .eq("status", "pending_approval")
          .eq("type", "withdrawal")
          .order("created_at", { ascending: false })

        if (error) throw error
        setPendingApprovals(data || [])

        // If we have an approve param, find and open that transaction
        if (approveId && data) {
          const txToApprove = data.find(tx => tx.id === approveId)
          if (txToApprove) {
            setSelectedTransaction(txToApprove)
            setShowApprovalDialog(true)
          }
        }
      } catch (error) {
        console.error("Error loading pending approvals:", error)
      }
    }

    loadPendingApprovals()
  }, [supabase, approveId])

  // Load initial transactions list
  useEffect(() => {
    const loadTransactions = async () => {
      setIsLoading(true)
      try {
        const { data, error, count } = await supabase
          .from("transactions")
          .select(`
            id, type, amount, status, created_at, user_id, payment_hash, memo,
            requires_approval, ip_address, user_agent,
            profiles:user_id (email, name)
          `, { count: "exact" })
          .order("created_at", { ascending: false })
          .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1)

        if (error) throw error
        
        setAllTransactions(data || [])
        setTotalCount(count || 0)
      } catch (error) {
        console.error("Error loading transactions:", error)
        toast.error("Failed to load transactions")
      } finally {
        setIsLoading(false)
      }
    }

    if (!hasSearched) {
      loadTransactions()
    }
  }, [currentPage, hasSearched, supabase])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setHasSearched(false)
      setTransactions([])
      setCurrentPage(1)
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    try {
      const result = await searchTransactions(searchQuery)
      if (result.success && result.transactions) {
        setTransactions(result.transactions)
      } else {
        toast.error(result.error || "Search failed")
        setTransactions([])
      }
    } catch (error) {
      toast.error("Error searching transactions")
      setTransactions([])
    } finally {
      setIsSearching(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setHasSearched(false)
    setTransactions([])
    setCurrentPage(1)
  }

  const handleApprovalAction = async (action: 'approve' | 'reject') => {
    if (!selectedTransaction) return

    setIsProcessing(true)
    try {
      const response = await fetch('/api/admin/withdrawals/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: selectedTransaction.id,
          action,
          rejectionReason: action === 'reject' ? rejectionReason : undefined,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success(action === 'approve' 
          ? 'Withdrawal approved and processed!' 
          : 'Withdrawal rejected'
        )
        setShowApprovalDialog(false)
        setSelectedTransaction(null)
        setRejectionReason("")
        
        // Refresh data
        setPendingApprovals(prev => prev.filter(tx => tx.id !== selectedTransaction.id))
        setAllTransactions(prev => prev.map(tx => 
          tx.id === selectedTransaction.id 
            ? { ...tx, status: action === 'approve' ? 'completed' : 'rejected' }
            : tx
        ))
      } else {
        toast.error(result.error || 'Action failed')
      }
    } catch (error) {
      toast.error('An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    if (type.includes("deposit") || type.includes("receive") || type.includes("reward")) {
      return <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
    }
    return <ArrowUpRight className="w-4 h-4 text-red-400" />
  }

  const getAmountColor = (type: string) => {
    if (type.includes("deposit") || type.includes("receive") || type.includes("reward")) {
      return "text-emerald-400"
    }
    return "text-red-400"
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500/20 text-emerald-400">completed</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400">pending</Badge>
      case 'pending_approval':
        return <Badge className="bg-orange-500/20 text-orange-400 animate-pulse">
          <Clock className="w-3 h-3 mr-1" />
          awaiting approval
        </Badge>
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400">rejected</Badge>
      default:
        return <Badge className="bg-red-500/20 text-red-400">{status}</Badge>
    }
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const displayTransactions = hasSearched ? transactions : allTransactions

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Transactions</h1>
        <p className="text-gray-400 mt-1">
          {hasSearched 
            ? `${transactions.length} search result(s)` 
            : `${totalCount.toLocaleString()} total transactions`}
        </p>
      </div>

      {/* Pending Approvals Section */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-semibold text-orange-400">
              Pending Approvals ({pendingApprovals.length})
            </h2>
          </div>
          
          <div className="space-y-3">
            {pendingApprovals.map((tx) => (
              <Card key={tx.id} className="bg-orange-950/30 border-orange-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-orange-500/20">
                        <Clock className="w-5 h-5 text-orange-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-white text-lg">
                            {tx.amount.toLocaleString()} sats
                          </span>
                          {getStatusBadge(tx.status)}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {(tx.profiles as { email?: string })?.email || tx.user_id.substring(0, 8)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(tx.created_at).toLocaleString()}
                          </span>
                          {tx.ip_address && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {tx.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500 text-red-400 hover:bg-red-500/20"
                        onClick={() => {
                          setSelectedTransaction(tx)
                          setShowApprovalDialog(true)
                        }}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          setSelectedTransaction(tx)
                          setShowApprovalDialog(true)
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search by ID, payment hash, or user ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white"
          />
        </div>
        <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? "Searching..." : "Search"}
        </Button>
        {hasSearched && (
          <Button type="button" variant="outline" onClick={clearSearch}>
            Clear
          </Button>
        )}
      </form>

      {/* Results */}
      {isLoading || isSearching ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : displayTransactions.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center">
            <CreditCard className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              {hasSearched ? `No transactions found matching "${searchQuery}"` : "No transactions found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {displayTransactions.map((tx) => (
              <Card key={tx.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-gray-800">
                        {getTransactionIcon(tx.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-white capitalize">
                            {tx.type.replace(/_/g, " ")}
                          </h3>
                          {getStatusBadge(tx.status)}
                          {tx.requires_approval && tx.status !== 'pending_approval' && (
                            <Badge className="bg-blue-500/20 text-blue-400">required approval</Badge>
                          )}
                        </div>
                        {tx.memo && (
                          <p className="text-sm text-gray-400 mb-2">{tx.memo}</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-300 font-mono text-xs truncate max-w-[200px]">
                              {(tx.profiles as { email?: string })?.email || tx.user_id}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-300">
                              {new Date(tx.created_at).toLocaleString()}
                            </span>
                          </div>
                          {tx.payment_hash && (
                            <div className="flex items-center gap-2 text-sm">
                              <Hash className="w-4 h-4 text-gray-500" />
                              <span className="text-gray-300 font-mono text-xs truncate max-w-[200px]">
                                {tx.payment_hash}
                              </span>
                            </div>
                          )}
                        </div>
                        {(tx.ip_address || tx.user_agent) && (
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            {tx.ip_address && (
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {tx.ip_address}
                              </span>
                            )}
                            {tx.user_agent && (
                              <span className="flex items-center gap-1 truncate max-w-[300px]">
                                <Monitor className="w-3 h-3" />
                                {tx.user_agent}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-3">
                          <p className="text-xs text-gray-500 font-mono">{tx.id}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`text-xl font-bold ${getAmountColor(tx.type)}`}>
                      {tx.type.includes("deposit") || tx.type.includes("receive") || tx.type.includes("reward") ? "+" : "-"}
                      {tx.amount.toLocaleString()} sats
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination - only show when not searching */}
          {!hasSearched && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-gray-400">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Withdrawal Approval
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Review this withdrawal request before approving or rejecting.
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount:</span>
                  <span className="font-bold text-xl text-orange-400">
                    {selectedTransaction.amount.toLocaleString()} sats
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">User:</span>
                  <span className="font-mono text-sm">
                    {(selectedTransaction.profiles as { email?: string })?.email || selectedTransaction.user_id.substring(0, 16)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Requested:</span>
                  <span className="text-sm">
                    {new Date(selectedTransaction.created_at).toLocaleString()}
                  </span>
                </div>
                {selectedTransaction.ip_address && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">IP:</span>
                    <span className="font-mono text-sm">{selectedTransaction.ip_address}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-gray-400">Rejection reason (optional):</label>
                <Textarea
                  placeholder="Enter reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowApprovalDialog(false)
                setSelectedTransaction(null)
                setRejectionReason("")
              }}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleApprovalAction('reject')}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Reject"}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleApprovalAction('approve')}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Approve & Pay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
