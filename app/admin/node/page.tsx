"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Server, 
  Wallet,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Activity
} from "lucide-react"
import { getNodeHealth } from "@/app/actions/admin-actions"
import { toast } from "sonner"

interface NodeHealth {
  online: boolean
  alias: string
  publicKey: string
  blockHeight: number
  syncedToChain: boolean
  syncedToGraph: boolean
  numActiveChannels: number
  numPeers: number
  totalCapacity: number
  localBalance: number
  remoteBalance: number
  pendingChannels: number
  onchainBalance: number
  onchainUnconfirmed: number
}

export default function AdminNodePage() {
  const [nodeHealth, setNodeHealth] = useState<NodeHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNodeHealth = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getNodeHealth()
      if (result.success && result.data) {
        setNodeHealth(result.data)
      } else {
        setError(result.error || "Failed to fetch node health")
      }
    } catch (err) {
      setError("Error connecting to node")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNodeHealth()
  }, [])

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(2)} BTC`
    } else if (sats >= 1000000) {
      return `${(sats / 1000000).toFixed(2)}M sats`
    } else if (sats >= 1000) {
      return `${(sats / 1000).toFixed(1)}k sats`
    }
    return `${sats} sats`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Node Health</h1>
          <p className="text-gray-400 mt-1">Lightning node status and balances</p>
        </div>
        <Button onClick={fetchNodeHealth} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : error ? (
        <Card className="bg-red-900/20 border-red-800">
          <CardContent className="p-6 flex items-center gap-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <div>
              <h3 className="font-medium text-red-400">Node Connection Error</h3>
              <p className="text-sm text-red-300/70">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : nodeHealth ? (
        <>
          {/* Status Banner */}
          <Card className={`border ${nodeHealth.online ? "bg-emerald-900/20 border-emerald-800" : "bg-red-900/20 border-red-800"}`}>
            <CardContent className="p-6 flex items-center gap-4">
              {nodeHealth.online ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-400" />
              )}
              <div className="flex-1">
                <h3 className={`font-medium ${nodeHealth.online ? "text-emerald-400" : "text-red-400"}`}>
                  {nodeHealth.online ? "Node Online" : "Node Offline"}
                </h3>
                <p className="text-sm text-gray-400 font-mono">{nodeHealth.alias}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Block Height</p>
                <p className="text-white font-mono">{nodeHealth.blockHeight.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          {/* Sync Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Chain Sync</span>
                </div>
                <Badge className={nodeHealth.syncedToChain ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"}>
                  {nodeHealth.syncedToChain ? "Synced" : "Syncing..."}
                </Badge>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Graph Sync</span>
                </div>
                <Badge className={nodeHealth.syncedToGraph ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"}>
                  {nodeHealth.syncedToGraph ? "Synced" : "Syncing..."}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Lightning Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatSats(nodeHealth.localBalance)}</p>
                <p className="text-sm text-gray-500">Local (spendable)</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Inbound Liquidity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatSats(nodeHealth.remoteBalance)}</p>
                <p className="text-sm text-gray-500">Remote (receivable)</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  On-chain Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatSats(nodeHealth.onchainBalance)}</p>
                {nodeHealth.onchainUnconfirmed > 0 && (
                  <p className="text-sm text-yellow-400">+{formatSats(nodeHealth.onchainUnconfirmed)} pending</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Channel Stats */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-white">Channel Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-400">Active Channels</p>
                  <p className="text-2xl font-bold text-white">{nodeHealth.numActiveChannels}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Pending Channels</p>
                  <p className="text-2xl font-bold text-white">{nodeHealth.pendingChannels}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Connected Peers</p>
                  <p className="text-2xl font-bold text-white">{nodeHealth.numPeers}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Total Capacity</p>
                  <p className="text-2xl font-bold text-white">{formatSats(nodeHealth.totalCapacity)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Public Key */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg text-white">Node Identity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 mb-2">Public Key</p>
              <p className="font-mono text-xs text-gray-300 break-all bg-gray-800 p-3 rounded-lg">
                {nodeHealth.publicKey}
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

