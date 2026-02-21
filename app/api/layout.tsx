import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "API Documentation for AI Agents | Ganamos",
  description: "API endpoints for AI agents to post jobs, fund issues, complete tasks, and earn sats on ganamos.earth",
}

export default function ApiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
