"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Package, 
  Search, 
  RefreshCw,
  ChevronDown,
  DollarSign,
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
import { toast } from "sonner"

type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "refunded" | "cancelled"

interface Order {
  id: string
  order_number: string
  email: string
  name: string
  amount_sats: number
  status: OrderStatus
  created_at: string
  shipping_address: string
  city: string
  state: string
  zip_code: string
  tracking_number?: string
  shipped_at?: string
}

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  shipped: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  refunded: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)

  const fetchOrders = async () => {
    setIsLoading(true)
    try {
      const result = await getAdminOrders()
      if (result.success && result.orders) {
        setOrders(result.orders)
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

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingOrderId(orderId)
    try {
      const result = await updateOrderStatus(orderId, newStatus)
      if (result.success) {
        setOrders(orders.map(order => 
          order.id === orderId ? { ...order, status: newStatus } : order
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

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.name.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const totalRevenue = orders.reduce((sum, order) => sum + order.amount_sats, 0)
  const pendingCount = orders.filter(o => o.status === "pending").length

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
              <p className="text-sm text-gray-400">Total Orders</p>
              <p className="text-2xl font-bold text-white">{orders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-yellow-400/10">
              <Package className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Pending</p>
              <p className="text-2xl font-bold text-white">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-400/10">
              <Bitcoin className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Revenue</p>
              <p className="text-2xl font-bold text-white">{(totalRevenue / 1000).toFixed(0)}k sats</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-gray-900 border-gray-800 text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-800">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
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
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Customer</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Amount</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Date</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4">
                        <p className="font-mono text-sm text-white">{order.order_number}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-white">{order.name}</p>
                        <p className="text-sm text-gray-400">{order.email}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-white">{order.amount_sats.toLocaleString()} sats</p>
                      </td>
                      <td className="p-4">
                        <Badge className={statusColors[order.status]}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-gray-400">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <Select 
                          value={order.status} 
                          onValueChange={(value) => handleStatusChange(order.id, value as OrderStatus)}
                          disabled={updatingOrderId === order.id}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs bg-gray-800 border-gray-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-800">
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="shipped">Shipped</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                            <SelectItem value="refunded">Refunded</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

