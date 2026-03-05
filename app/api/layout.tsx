import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "API Documentation | Ganamos",
  description: "API documentation has moved to docs.ganamos.earth",
}

export default function ApiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
