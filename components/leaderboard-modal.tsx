"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface LeaderboardEntry {
  rank: number
  petName: string
  score: number
  isYou: boolean
}

interface LeaderboardData {
  success: boolean
  leaderboard: LeaderboardEntry[]
}

interface LeaderboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceId?: string
}

const getRankEmoji = (rank: number): string => {
  switch (rank) {
    case 1:
      return "🥇"
    case 2:
      return "🥈"
    case 3:
      return "🥉"
    default:
      return ""
  }
}

export function LeaderboardModal({
  open,
  onOpenChange,
  deviceId,
}: LeaderboardModalProps) {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchLeaderboard()
    }
  }, [open, deviceId])

  const fetchLeaderboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = deviceId
        ? `/api/device/game-score?deviceId=${deviceId}`
        : "/api/device/game-score"
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error("Failed to fetch leaderboard")
      }
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-destructive">{error}</div>
          </div>
        ) : data?.leaderboard ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.leaderboard.map((entry) => (
                <TableRow
                  key={entry.rank}
                  className={entry.isYou ? "bg-accent" : ""}
                >
                  <TableCell className="font-medium">
                    {getRankEmoji(entry.rank)} {entry.rank}
                  </TableCell>
                  <TableCell className="font-medium">{entry.petName}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {entry.score}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">No scores yet</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}