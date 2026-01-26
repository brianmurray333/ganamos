"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import Link from "next/link"
import { 
  LayoutDashboard, 
  Package, 
  Server, 
  Users, 
  FileText, 
  CreditCard,
  Activity,
  GitPullRequest,
  LogOut,
  Menu,
  X,
  Wallet,
  UserPlus,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { getSystemSettings, toggleWithdrawals, toggleSignups } from "@/app/actions/admin-actions"
import { toast } from "sonner"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Pet Orders", icon: Package },
  { href: "/admin/node", label: "Node Health", icon: Server },
  { href: "/admin/audit", label: "Balance Audit", icon: Activity },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/posts", label: "Posts", icon: FileText },
  { href: "/admin/transactions", label: "Transactions", icon: CreditCard },
  { href: "/admin/services", label: "Services", icon: Activity },
  { href: "/admin/prs", label: "PR Log", icon: GitPullRequest },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  // Kill switch states
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(true)
  const [signupsEnabled, setSignupsEnabled] = useState(true)
  const [isTogglingWithdrawals, setIsTogglingWithdrawals] = useState(false)
  const [isTogglingSignups, setIsTogglingSignups] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createBrowserSupabaseClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        if (pathname !== "/admin/login") {
          router.push("/admin/login")
        }
        setIsLoading(false)
        return
      }

      const email = session.user.email
      setUserEmail(email || null)

      if (email !== ADMIN_EMAIL) {
        // Not authorized
        await supabase.auth.signOut()
        router.push("/admin/login?error=unauthorized")
        setIsLoading(false)
        return
      }

      setIsAuthenticated(true)
      setIsLoading(false)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setIsAuthenticated(false)
        router.push("/admin/login")
      } else if (event === "SIGNED_IN" && session) {
        const email = session.user.email
        if (email === ADMIN_EMAIL) {
          setIsAuthenticated(true)
          setUserEmail(email)
          if (pathname === "/admin/login") {
            router.push("/admin")
          }
        } else {
          await supabase.auth.signOut()
          router.push("/admin/login?error=unauthorized")
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, router, pathname])

  // Fetch system settings
  useEffect(() => {
    const fetchSettings = async () => {
      if (!isAuthenticated) return
      try {
        const result = await getSystemSettings()
        if (result.success && result.settings) {
          setWithdrawalsEnabled(result.settings.withdrawalsEnabled)
          setSignupsEnabled(result.settings.signupsEnabled)
        }
      } catch (error) {
        console.error("Error fetching system settings:", error)
      }
    }
    fetchSettings()
  }, [isAuthenticated])

  const handleToggleWithdrawals = async () => {
    const newValue = !withdrawalsEnabled
    if (!newValue && !confirm("Are you sure you want to DISABLE withdrawals?")) return
    
    setIsTogglingWithdrawals(true)
    try {
      const result = await toggleWithdrawals(newValue)
      if (result.success) {
        setWithdrawalsEnabled(newValue)
        toast.success(`Withdrawals ${newValue ? 'enabled' : 'disabled'}`)
      } else {
        toast.error(result.error || "Failed to toggle")
      }
    } catch {
      toast.error("Failed to toggle withdrawals")
    } finally {
      setIsTogglingWithdrawals(false)
    }
  }

  const handleToggleSignups = async () => {
    const newValue = !signupsEnabled
    setIsTogglingSignups(true)
    try {
      const result = await toggleSignups(newValue)
      if (result.success) {
        setSignupsEnabled(newValue)
        toast.success(`Signups ${newValue ? 'enabled' : 'disabled'}`)
      } else {
        toast.error(result.error || "Failed to toggle")
      }
    } catch {
      toast.error("Failed to toggle signups")
    } finally {
      setIsTogglingSignups(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/admin/login")
  }

  // Show login page without layout
  if (pathname === "/admin/login") {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <>
      {/* Global style to hide bottom navigation in admin */}
      <style jsx global>{`
        .admin-layout ~ nav,
        .admin-layout ~ div[class*="bottom-nav"],
        nav[class*="bottom"],
        div[class*="fixed bottom"],
        .bottom-navigation,
        [data-bottom-nav] {
          display: none !important;
        }
      `}</style>
      
      <div className="admin-layout min-h-screen bg-gray-950 text-white">
        {/* Mobile header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-400 hover:text-white"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
            <span className="font-['Pacifico'] text-xl text-white">Ganamos!</span>
          </div>
        </div>

        {/* Sidebar */}
        <aside className={cn(
          "fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-40 transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Spacer to account for main header */}
          <div className="h-16 lg:h-20" />

          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== "/admin" && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive 
                      ? "bg-emerald-600/20 text-emerald-400" 
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Kill Switches */}
          <div className="absolute bottom-20 left-0 right-0 px-4 space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-3 mb-2">
              Kill Switches
            </div>
            
            {/* Withdrawals Toggle */}
            <div className={cn(
              "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
              withdrawalsEnabled ? "bg-gray-800/50" : "bg-red-900/30 border border-red-800"
            )}>
              <div className="flex items-center gap-2">
                <Wallet size={16} className={withdrawalsEnabled ? "text-gray-400" : "text-red-400"} />
                <span className={cn("text-sm", withdrawalsEnabled ? "text-gray-300" : "text-red-300")}>
                  Withdrawals
                </span>
              </div>
              {isTogglingWithdrawals ? (
                <Loader2 size={16} className="animate-spin text-gray-400" />
              ) : (
                <Switch
                  checked={withdrawalsEnabled}
                  onCheckedChange={handleToggleWithdrawals}
                  className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-red-600"
                />
              )}
            </div>

            {/* Signups Toggle */}
            <div className={cn(
              "flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
              signupsEnabled ? "bg-gray-800/50" : "bg-yellow-900/30 border border-yellow-800"
            )}>
              <div className="flex items-center gap-2">
                <UserPlus size={16} className={signupsEnabled ? "text-gray-400" : "text-yellow-400"} />
                <span className={cn("text-sm", signupsEnabled ? "text-gray-300" : "text-yellow-300")}>
                  Signups
                </span>
              </div>
              {isTogglingSignups ? (
                <Loader2 size={16} className="animate-spin text-gray-400" />
              ) : (
                <Switch
                  checked={signupsEnabled}
                  onCheckedChange={handleToggleSignups}
                  className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-yellow-600"
                />
              )}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 w-full transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </>
  )
}
