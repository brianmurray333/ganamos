"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  GitPullRequest,
  RefreshCw,
  ExternalLink,
  GitMerge,
  XCircle,
  Clock
} from "lucide-react"
import { getPRLog } from "@/app/actions/admin-actions"
import { toast } from "sonner"

interface PREntry {
  id: string
  pr_number: number
  pr_url: string
  title: string
  status: "open" | "merged" | "closed"
  author: string
  created_at: string
  merged_at?: string
}

export default function AdminPRsPage() {
  const [prs, setPrs] = useState<PREntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchPRs = async () => {
    setIsLoading(true)
    try {
      const result = await getPRLog()
      if (result.success && result.prs) {
        setPrs(result.prs)
      } else {
        // No PRs yet is fine
        setPrs([])
      }
    } catch (error) {
      console.error("Error fetching PRs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPRs()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "merged":
        return <GitMerge className="w-4 h-4 text-purple-400" />
      case "closed":
        return <XCircle className="w-4 h-4 text-red-400" />
      default:
        return <Clock className="w-4 h-4 text-emerald-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "merged":
        return <Badge className="bg-purple-500/20 text-purple-400">Merged</Badge>
      case "closed":
        return <Badge className="bg-red-500/20 text-red-400">Closed</Badge>
      default:
        return <Badge className="bg-emerald-500/20 text-emerald-400">Open</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pull Request Log</h1>
          <p className="text-gray-400 mt-1">Track GitHub pull requests</p>
        </div>
        <Button onClick={fetchPRs} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <p className="text-sm text-gray-400">Total PRs</p>
            <p className="text-2xl font-bold text-white">{prs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <p className="text-sm text-gray-400">Open</p>
            <p className="text-2xl font-bold text-emerald-400">
              {prs.filter(pr => pr.status === "open").length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <p className="text-sm text-gray-400">Merged</p>
            <p className="text-2xl font-bold text-purple-400">
              {prs.filter(pr => pr.status === "merged").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* PR List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : prs.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center">
            <GitPullRequest className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No pull requests logged yet</p>
            <p className="text-sm text-gray-500 mt-2">
              PRs will appear here when the GitHub webhook is configured
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left p-4 text-sm font-medium text-gray-400">PR</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Title</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Author</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400">Created</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-400"></th>
                  </tr>
                </thead>
                <tbody>
                  {prs.map((pr) => (
                    <tr key={pr.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(pr.status)}
                          <span className="font-mono text-white">#{pr.pr_number}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-white line-clamp-1">{pr.title}</p>
                      </td>
                      <td className="p-4 text-gray-400">{pr.author}</td>
                      <td className="p-4">{getStatusBadge(pr.status)}</td>
                      <td className="p-4 text-sm text-gray-400">
                        {new Date(pr.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <a
                          href={pr.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-white"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

