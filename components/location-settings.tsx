"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, RotateCcw, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { 
  getLocationPermissionState, 
  getCachedLocation, 
  clearLocationData, 
  getCurrentLocationWithName 
} from "@/lib/geocoding"
import { toast } from "sonner"

export function LocationSettings() {
  const [permissionState, setPermissionState] = useState<LocationPermissionState>({ status: 'unknown', lastChecked: 0 })
  const [cachedLocation, setCachedLocation] = useState<LocationData | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isClient, setIsClient] = useState(false)

  // Initialize state after hydration to prevent hydration mismatch
  useEffect(() => {
    setIsClient(true)
    setPermissionState(getLocationPermissionState())
    setCachedLocation(getCachedLocation())
  }, [])

  const refreshPermissionState = () => {
    setPermissionState(getLocationPermissionState())
    setCachedLocation(getCachedLocation())
  }

  const handleClearData = () => {
    clearLocationData()
    setPermissionState({ status: 'unknown', lastChecked: 0 })
    setCachedLocation(null)
    toast("Location Data Cleared", {
      description: "Location permissions and cached data have been reset. The app will ask for permission again next time you use location features.",
    })
  }

  const handleRefreshLocation = async () => {
    setIsRefreshing(true)
    try {
      const location = await getCurrentLocationWithName({ forceRefresh: true, useCache: false })
      if (location) {
        refreshPermissionState()
        toast.success("Location Updated", {
          description: `Location refreshed: ${location.name}`,
        })
      }
    } catch (error: any) {
      console.error("Error refreshing location:", error)
      refreshPermissionState() // Update state even if failed
      
      let errorMessage = "Failed to get location"
      if (error.code === 1) {
        errorMessage = "Location permission denied"
      } else if (error.code === 2) {
        errorMessage = "Location unavailable"
      } else if (error.code === 3) {
        errorMessage = "Location request timed out"
      }
      
      toast.error("Location Error", {
        description: errorMessage,
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const getStatusIcon = () => {
    switch (permissionState.status) {
      case 'granted':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'denied':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'prompt':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusColor = () => {
    switch (permissionState.status) {
      case 'granted':
        return 'bg-green-100 text-green-800'
      case 'denied':
        return 'bg-red-100 text-red-800'
      case 'prompt':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Show loading state during hydration
  if (!isClient) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Location Settings
          </CardTitle>
          <CardDescription>
            Manage your location permissions and cached data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Permission Status:</span>
              <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Location Settings
        </CardTitle>
        <CardDescription>
          Manage your location permissions and cached data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Permission Status:</span>
            <Badge className={getStatusColor()}>
              <div className="flex items-center gap-1">
                {getStatusIcon()}
                {permissionState.status}
              </div>
            </Badge>
          </div>
          
          {permissionState.lastChecked > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Last Checked:</span>
              <span className="text-sm text-gray-600">
                {new Date(permissionState.lastChecked).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {cachedLocation && (
          <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h4 className="text-sm font-medium">Cached Location:</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{cachedLocation.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {cachedLocation.latitude.toFixed(4)}, {cachedLocation.longitude.toFixed(4)}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button 
            onClick={handleRefreshLocation} 
            disabled={isRefreshing}
            variant="outline"
            size="sm"
          >
            <RotateCcw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Location'}
          </Button>
          
          <Button 
            onClick={handleClearData}
            variant="outline" 
            size="sm"
          >
            Clear Data
          </Button>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>• Location data is cached for 72 hours to avoid repeated permission requests</p>
          <p>• Use "Clear Data" if you want to reset permissions or change location access</p>
          <p>• Use "Refresh Location" to get your current location with fresh permission check</p>
        </div>
      </CardContent>
    </Card>
  )
}
