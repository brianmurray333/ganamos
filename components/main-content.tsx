"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const HEADERLESS_ROUTES = ["/auth", "/post/new", "/wallet/withdraw", "/wallet/deposit", "/pet-settings", "/satoshi-pet"]

function isHeaderHidden(pathname: string) {
  return HEADERLESS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  )
}

export function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const showHeaderPadding = !isHeaderHidden(pathname)

  return (
    <main
      className={cn(
        "min-h-[calc(100vh-4rem)] mx-auto bg-background pt-[env(safe-area-inset-top)]",
        showHeaderPadding && "lg:pt-16"
      )}
    >
      {children}
    </main>
  )
}
