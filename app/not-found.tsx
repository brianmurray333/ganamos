import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
        <p className="mb-8 text-muted-foreground">The page you are looking for doesn't exist or has been moved.</p>
        <Button asChild>
          <Link href="/dashboard">Return to Home</Link>
        </Button>
      </div>
    </div>
  )
}
