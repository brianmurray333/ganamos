"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Play
} from "lucide-react"
import { getAuditStatus, triggerBalanceAudit } from "@/app/actions/admin-actions"
import { toast } from "sonner"

interface AuditResult {
  lastRunAt: string
  status: "passed" | "failed" | "pending"
  totalUsers: number
  usersWithDiscrepancies: number
  totalDiscrepancy: number
  details?: {
    userId: string
    username: string
    expectedBalance: number
    actualBalance: number
    difference: number
  }[]
}

export default function AdminAuditPage() {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)

  const fetchAuditStatus = async () => {
    setIsLoading(true)
    try {
      const result = await getAuditStatus()
      if (result.success && result.data) {
        setAuditResult(result.data)
      }
    } catch (error) {
      console.error("Error fetching audit status:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAuditStatus()
  }, [])

  const handleRunAudit = async () => {
    setIsRunning(true)
    try {
      const result = await triggerBalanceAudit()
      if (result.success) {
        toast.success("Audit completed")
        if (result.data) {
          setAuditResult(result.data)
        }
      } else {
        toast.error(result.error || "Audit failed")
      }
    } catch (error) {
      toast.error("Error running audit")
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Balance Audit</h1>
          <p className="text-gray-400 mt-1">Verify user balance integrity</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAuditStatus} variant="outline" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button 
            onClick={handleRunAudit} 
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Running Audit...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Audit
              </>
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : auditResult ? (
        <>
          {/* Status Banner */}
          <Card className={`border ${
            auditResult.status === "passed" 
              ? "bg-emerald-900/20 border-emerald-800" 
              : auditResult.status === "failed"
              ? "bg-red-900/20 border-red-800"
              : "bg-yellow-900/20 border-yellow-800"
          }`}>
            <CardContent className="p-6 flex items-center gap-4">
              {auditResult.status === "passed" ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-yellow-400" />
              )}
              <div className="flex-1">
                <h3 className={`font-medium ${
                  auditResult.status === "passed" ? "text-emerald-400" : "text-yellow-400"
                }`}>
                  {auditResult.status === "passed" 
                    ? "All Balances Verified" 
                    : auditResult.status === "failed"
                    ? "Discrepancies Found"
                    : "Audit Pending"
                  }
                </h3>
                <p className="text-sm text-gray-400">
                  Last run: {new Date(auditResult.lastRunAt).toLocaleString()}
                </p>
              </div>
              <Badge className={
                auditResult.status === "passed" 
                  ? "bg-emerald-500/20 text-emerald-400" 
                  : "bg-yellow-500/20 text-yellow-400"
              }>
                {auditResult.status.toUpperCase()}
              </Badge>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <p className="text-sm text-gray-400">Total Users Audited</p>
                <p className="text-2xl font-bold text-white">{auditResult.totalUsers}</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <p className="text-sm text-gray-400">Users with Discrepancies</p>
                <p className={`text-2xl font-bold ${auditResult.usersWithDiscrepancies > 0 ? "text-yellow-400" : "text-white"}`}>
                  {auditResult.usersWithDiscrepancies}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <p className="text-sm text-gray-400">Total Discrepancy</p>
                <p className={`text-2xl font-bold ${auditResult.totalDiscrepancy !== 0 ? "text-yellow-400" : "text-white"}`}>
                  {auditResult.totalDiscrepancy.toLocaleString()} sats
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Discrepancy Details */}
          {auditResult.details && auditResult.details.length > 0 && (
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg text-white">Discrepancy Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left p-3 text-sm font-medium text-gray-400">User</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-400">Expected</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-400">Actual</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-400">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditResult.details.map((detail) => (
                        <tr key={detail.userId} className="border-b border-gray-800">
                          <td className="p-3">
                            <p className="text-white">{detail.username}</p>
                            <p className="text-xs text-gray-500 font-mono">{detail.userId}</p>
                          </td>
                          <td className="p-3 text-right text-white">
                            {detail.expectedBalance.toLocaleString()} sats
                          </td>
                          <td className="p-3 text-right text-white">
                            {detail.actualBalance.toLocaleString()} sats
                          </td>
                          <td className={`p-3 text-right font-medium ${
                            detail.difference > 0 ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {detail.difference > 0 ? "+" : ""}{detail.difference.toLocaleString()} sats
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No audit data available. Run an audit to check balances.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

