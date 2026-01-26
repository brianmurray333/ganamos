"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Mail,
  Map,
  Brain,
  Database,
  Cloud
} from "lucide-react"
import { checkServiceStatus } from "@/app/actions/admin-actions"
import { toast } from "sonner"

interface ServiceStatus {
  name: string
  status: "online" | "offline" | "degraded" | "unknown"
  latency?: number
  lastChecked: string
  details?: string
}

const serviceIcons: Record<string, any> = {
  "Lightning Node": Zap,
  "Resend Email": Mail,
  "Google Maps": Map,
  "Groq AI": Brain,
  "Supabase": Database,
}

export default function AdminServicesPage() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchServiceStatus = async () => {
    setIsLoading(true)
    try {
      const result = await checkServiceStatus()
      if (result.success && result.services) {
        setServices(result.services)
      } else {
        toast.error("Failed to check services")
      }
    } catch (error) {
      toast.error("Error checking service status")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchServiceStatus()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      case "offline":
        return <XCircle className="w-5 h-5 text-red-400" />
      case "degraded":
        return <AlertCircle className="w-5 h-5 text-yellow-400" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return <Badge className="bg-emerald-500/20 text-emerald-400">Online</Badge>
      case "offline":
        return <Badge className="bg-red-500/20 text-red-400">Offline</Badge>
      case "degraded":
        return <Badge className="bg-yellow-500/20 text-yellow-400">Degraded</Badge>
      default:
        return <Badge className="bg-gray-500/20 text-gray-400">Unknown</Badge>
    }
  }

  const onlineCount = services.filter(s => s.status === "online").length
  const totalCount = services.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Service Status</h1>
          <p className="text-gray-400 mt-1">Monitor connected services health</p>
        </div>
        <Button onClick={fetchServiceStatus} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Status */}
      <Card className={`border ${
        onlineCount === totalCount 
          ? "bg-emerald-900/20 border-emerald-800"
          : onlineCount === 0
          ? "bg-red-900/20 border-red-800"
          : "bg-yellow-900/20 border-yellow-800"
      }`}>
        <CardContent className="p-6 flex items-center gap-4">
          {onlineCount === totalCount ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          ) : onlineCount === 0 ? (
            <XCircle className="w-8 h-8 text-red-400" />
          ) : (
            <AlertCircle className="w-8 h-8 text-yellow-400" />
          )}
          <div>
            <h3 className={`font-medium ${
              onlineCount === totalCount 
                ? "text-emerald-400"
                : onlineCount === 0
                ? "text-red-400"
                : "text-yellow-400"
            }`}>
              {onlineCount === totalCount 
                ? "All Services Operational"
                : `${onlineCount}/${totalCount} Services Online`
              }
            </h3>
            <p className="text-sm text-gray-400">
              Last checked: {services[0]?.lastChecked ? new Date(services[0].lastChecked).toLocaleTimeString() : "Never"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Services Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => {
            const Icon = serviceIcons[service.name] || Cloud
            return (
              <Card key={service.name} className="bg-gray-900 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-gray-800">
                        <Icon className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-white">{service.name}</h3>
                        {service.latency && (
                          <p className="text-sm text-gray-400">{service.latency}ms latency</p>
                        )}
                        {service.details && (
                          <p className="text-sm text-gray-500 mt-1">{service.details}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(service.status)}
                      {getStatusBadge(service.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

