"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Package,
  Search,
  RefreshCw,
  Bitcoin
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getAdminOrders, updateOrderStatus } from "@/app/actions/admin-actions"
import { toast } from "@/components/ui/toast"

// pet_orders.order_status (fulfilment) and pet_orders.payment_status, per the table's CHECK constraints
type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled"
type PaymentStatus = "pending" | "paid" | "expired" | "failed"

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
const PAID_ONLY_STATUSES: OrderStatus[] = ["shipped", "delivered"]

interface Order {
  id: string
  order_number: string
  email: string
  full_name: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  total_price_sats: number
  payment_status: PaymentStatus
  paid_at: string | null
  order_status: OrderStatus
  is_preorder: boolean
  created_at: string
  tracking_number?: string | null
  shipped_at?: string | null
}

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  confirmed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  shipped: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
}

const paymentColors: Record<PaymentStatus, string> = {
  paid: "bg-emerald-500 text-white border-emerald-400",
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  expired: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [paymentFilter, setPaymentFilter] = useState<string>("paid")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const result = await getAdminOrders()
      if (result.success && result.orders) {
        setOrders(result.orders as Order[])
      } else {
        toast.error("Failed to fetch orders")
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
      toast.error("Error loading orders")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const handleStatusChange = async (order: Order, newStatus: OrderStatus) => {
    if (PAID_ONLY_STATUSES.includes(newStatus) && order.payment_status !== "paid") {
      toast.error("Only paid orders can be marked shipped or delivered")
      return
    }
    setUpdatingOrderId(order.id)
    try {
      const result = await updateOrderStatus(order.id, newStatus)
      if (result.success) {
        setOrders(prev => prev.map(o =>
          o.id === order.id ? { ...o, order_status: newStatus } : o
        ))
        toast.success(`Order status updated to ${newStatus}`)
      } else {
        toast.error(result.error || "Failed to update status")
      }
    } catch (error) {
      toast.error("Error updating order status")
    } finally {
      setUpdatingOrderId(null)
    }
  }

  const q = searchQuery.toLowerCase()
  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      (order.order_number || "").toLowerCase().includes(q) ||
      (order.email || "").toLowerCase().includes(q) ||
      (order.full_name || "").toLowerCase().includes(q)
    const matchesPayment = paymentFilter === "all" || order.payment_status === paymentFilter
    const matchesStatus = statusFilter === "all" || order.order_status === statusFilter
    return matchesSearch && matchesPayment && matchesStatus
  })

  const paidOrders = orders.filter(o => o.payment_status === "paid")
  const totalRevenue = paidOrders.reduce((sum, order) => sum + (order.total_price_sats || 0), 0)
  const toShipCount = paidOrders.filter(o => ["pending", "confirmed", "processing"].includes(o.order_status)).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pet Orders</h1>
          <p className="text-gray-400 mt-1">Manage Satoshi Pet orders</p>
        </div>
        <Button onClick={fetchOrders} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-orange-400/10">
              <Package className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Paid Orders</p>
              <p className="text-2xl font-bold text-white">{paidOrders.length}</p>
              <p className="text-xs text-gray-500">{orders.length} total incl. unpaid</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-yellow-400/10">
              <Package className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Paid, to ship</p>
              <p className="text-2xl font-bold text-white">{toShipCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-400/10">
              <Bitcoin className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Revenue (paid)</p>
              <p className="text-2xl font-bold text-white">{totalRevenue.toLocaleString()} sats</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white"
          />
        </div>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-44 bg-gray-900 border-gray-800 text-white" aria-label="Payment status">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-800">
            <SelectItem value="paid">Paid only</SelectItem>
            <SelectItem value="pending">Awaiting payment</SelectItem>
            <SelectItem value="expired">Expired (unpaid)</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="all">All payments</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-gray-900 border-gray-800 text-white" aria-label="Order status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-800">
            <SelectItem value="all">All Status</SelectItem>
            {ORDER_STATUSES.map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Loading orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Order</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Payment</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Customer</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Ship to</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Amount</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const isPaid = order.payment_status === "paid"
                    return (
                      <tr key={order.id} className="border-b border-gray-800 hover:bg-gray-800/50 align-top">
                        <td className="p-4">
                          <p className="font-mono text-sm text-white">{order.order_number}</p>
                          {order.is_preorder && <p className="text-xs text-gray-500">Pre-order</p>}
                        </td>
                        <td className="p-4">
                          <Badge className={`${paymentColors[order.payment_status] || ""} uppercase font-bold`}>
                            {isPaid ? "Paid" : order.payment_status === "pending" ? "Unpaid" : order.payment_status}
                          </Badge>
                          {isPaid && order.paid_at && (
                            <p className="text-xs text-gray-500 mt-1">{new Date(order.paid_at).toLocaleString()}</p>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="text-white">{order.full_name}</p>
                          <p className="text-sm text-gray-400">{order.email}</p>
                        </td>
                        <td className="p-4 text-sm text-gray-300">
                          <p>{order.address_line1}</p>
                          {order.address_line2 && <p>{order.address_line2}</p>}
                          <p>{order.city}, {order.state} {order.postal_code}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-white">{(order.total_price_sats || 0).toLocaleString()} sats</p>
                        </td>
                        <td className="p-4">
                          <Badge className={statusColors[order.order_status] || ""}>
                            {order.order_status}
                          </Badge>
                          {order.tracking_number && (
                            <p className="text-xs text-gray-500 mt-1 font-mono">{order.tracking_number}</p>
                          )}
                        </td>
                        <td className="p-4 text-sm text-gray-400">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <Select
                            value={order.order_status}
                            onValueChange={(value) => handleStatusChange(order, value as OrderStatus)}
                            disabled={updatingOrderId === order.id}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs bg-gray-800 border-gray-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-800">
                              {ORDER_STATUSES.map(s => (
                                <SelectItem
                                  key={s}
                                  value={s}
                                  className="capitalize"
                                  disabled={!isPaid && PAID_ONLY_STATUSES.includes(s)}
                                >
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
