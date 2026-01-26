"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Package, 
  Users, 
  FileText, 
  CreditCard
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"

interface DashboardStats {
  totalOrders: number
  pendingOrders: number
  totalUsers: number
  totalPosts: number
  totalTransactions: number
  nodeOnline: boolean
}

interface IntegrationStatus {
  name: string
  status: "online" | "offline"
  logo: string
}

// Map service names to logo files
const integrationLogos: Record<string, string> = {
  "GitHub": "/logos/github.png",
  "Google Maps": "/logos/google maps.png",
  "Groq AI": "/logos/groq.png",
  "Resend Email": "/logos/resend.png",
  "Supabase": "/logos/supabase.jpg",
  "Lightning Node": "/logos/voltage.png",
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    pendingOrders: 0,
    totalUsers: 0,
    totalPosts: 0,
    totalTransactions: 0,
    nodeOnline: false,
  })
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [integrationsLoading, setIntegrationsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch stats from API
        const { getAdminStats, getNodeHealth, checkServiceStatus } = await import("@/app/actions/admin-actions")
        
        const [statsResult, nodeResult, servicesResult] = await Promise.all([
          getAdminStats(),
          getNodeHealth(),
          checkServiceStatus()
        ])

        if (statsResult.success && statsResult.stats) {
          setStats(prev => ({
            ...prev,
            ...statsResult.stats
          }))
        }

        if (nodeResult.success) {
          setStats(prev => ({
            ...prev,
            nodeOnline: nodeResult.data?.online || false
          }))
        }

        if (servicesResult.success && servicesResult.services) {
          setIntegrations(
            servicesResult.services.map((service: { name: string; status: string }) => ({
              name: service.name,
              status: service.status as "online" | "offline",
              logo: integrationLogos[service.name] || "/logos/github.png",
            }))
          )
        }
      } catch (error) {
        console.error("Error fetching stats:", error)
      } finally {
        setIsLoading(false)
        setIntegrationsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const statCards = [
    {
      title: "Pet Orders",
      value: stats.totalOrders,
      subtitle: `${stats.pendingOrders} pending`,
      icon: Package,
      href: "/admin/orders",
      color: "text-orange-400",
      bgColor: "bg-orange-400/10",
    },
    {
      title: "Users",
      value: stats.totalUsers,
      subtitle: "Total registered",
      icon: Users,
      href: "/admin/users",
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
    },
    {
      title: "Posts",
      value: stats.totalPosts,
      subtitle: "Total posts",
      icon: FileText,
      href: "/admin/posts",
      color: "text-purple-400",
      bgColor: "bg-purple-400/10",
    },
    {
      title: "Transactions",
      value: stats.totalTransactions,
      subtitle: "Total transactions",
      icon: CreditCard,
      href: "/admin/transactions",
      color: "text-emerald-400",
      bgColor: "bg-emerald-400/10",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 w-16 bg-gray-800 animate-pulse rounded" />
                ) : (
                  <>
                    <div className="text-2xl font-bold text-white">
                      {card.value.toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Integrations Mosaic */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Integrations</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {integrationsLoading ? (
            // Loading skeletons
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex flex-col items-center justify-center gap-2 h-20"
              >
                <div className="w-8 h-8 bg-gray-800 animate-pulse rounded" />
                <div className="w-12 h-2 bg-gray-800 animate-pulse rounded" />
              </div>
            ))
          ) : (
            integrations.map((integration) => (
              <div
                key={integration.name}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex flex-col items-center justify-center gap-2 h-20 hover:border-gray-700 transition-colors"
                title={`${integration.name}: ${integration.status}`}
              >
                <div className="relative">
                  <Image
                    src={integration.logo}
                    alt={integration.name}
                    width={28}
                    height={28}
                    className="object-contain"
                  />
                  {/* Status indicator */}
                  <span
                    className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                      integration.status === "online"
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-red-500"
                    }`}
                  />
                </div>
                <span className="text-[10px] text-gray-400 text-center leading-tight truncate w-full">
                  {integration.name}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

