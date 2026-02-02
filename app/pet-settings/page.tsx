"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, Cat, Dog, Rabbit, Squirrel, Turtle, Trash2, Check, ArrowLeft } from "lucide-react"
import { OwlIcon } from "@/components/icons/owl-icon"
import { toast } from "sonner"
import { LoadingSpinner } from "@/components/loading-spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function PetSettingsPage() {
  const router = useRouter()
  const { user, activeUserId } = useAuth()
  const [device, setDevice] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUnpairing, setIsUnpairing] = useState(false)
  const [showUnpairDialog, setShowUnpairDialog] = useState(false)
  
  // Form state
  const [petName, setPetName] = useState("")
  const [petType, setPetType] = useState<'cat' | 'dog' | 'rabbit' | 'squirrel' | 'turtle' | 'owl'>('cat')
  const [hasChanges, setHasChanges] = useState(false)

  // Fetch device data
  const fetchDevice = useCallback(async () => {
    const targetUserId = activeUserId || user?.id
    if (!targetUserId) return
    
    try {
      setIsLoading(true)
      const response = await fetch(`/api/device/list?activeUserId=${encodeURIComponent(targetUserId)}`)
      const data = await response.json()

      if (data.success && data.devices && data.devices.length > 0) {
        const firstDevice = data.devices[0]
        setDevice(firstDevice)
        setPetName(firstDevice.pet_name || "")
        setPetType(firstDevice.pet_type || 'cat')
      } else {
        // No device connected, redirect to connect page
        toast.error("No Pet Connected", {
          description: "Please connect a pet first.",
        })
        router.push('/connect-pet')
      }
    } catch (error) {
      console.error('Error fetching device:', error)
      toast.error("Error", {
        description: "Failed to load pet settings.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [router, toast, activeUserId, user?.id])

  useEffect(() => {
    fetchDevice()
  }, [fetchDevice])

  // Check if there are unsaved changes
  useEffect(() => {
    if (device) {
      const nameChanged = petName !== (device.pet_name || "")
      const typeChanged = petType !== (device.pet_type || 'cat')
      setHasChanges(nameChanged || typeChanged)
    }
  }, [petName, petType, device])

  const getPetIcon = (type: string, size: number = 80) => {
    const iconProps = { size, color: "white", strokeWidth: 1.5 }
    switch (type) {
      case 'dog': return <Dog {...iconProps} />
      case 'rabbit': return <Rabbit {...iconProps} />
      case 'squirrel': return <Squirrel {...iconProps} />
      case 'turtle': return <Turtle {...iconProps} />
      case 'owl': return <OwlIcon size={size} color="white" />
      default: return <Cat {...iconProps} />
    }
  }

  const handleSave = async () => {
    if (!device || !petName.trim()) {
      toast.error("Invalid Name", {
        description: "Please enter a pet name.",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch('/api/device/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: device.id,
          petName: petName.trim(),
          petType,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Settings Saved", {
          description: "Your pet settings have been updated.",
        })
        // Update local device state
        setDevice({ ...device, pet_name: petName.trim(), pet_type: petType })
        setHasChanges(false)
      } else {
        toast.error("Save Failed", {
          description: result.error || "Failed to update settings.",
        })
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error("Error", {
        description: "Failed to save settings. Please try again.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleUnpair = async () => {
    if (!device) return

    setIsUnpairing(true)
    try {
      const response = await fetch('/api/device/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId: device.id,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Pet Unpaired", {
          description: "Your device has been disconnected.",
        })
        
        // Clear the pet cache to ensure profile page doesn't show stale data
        const targetUserId = activeUserId || user?.id
        if (targetUserId) {
          localStorage.removeItem(`ganamos_pet_${targetUserId}`)
        }
        
        // Redirect to profile
        router.push('/profile')
      } else {
        toast.error("Unpair Failed", {
          description: result.error || "Failed to unpair device.",
        })
      }
    } catch (error) {
      console.error('Error unpairing device:', error)
      toast.error("Error", {
        description: "Failed to unpair device. Please try again.",
      })
    } finally {
      setIsUnpairing(false)
      setShowUnpairDialog(false)
    }
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  if (!device) {
    return null // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-lg font-semibold">Pet Settings</h1>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/profile')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto p-4 space-y-8">
        {/* Pet Visual */}
        <div className="text-center space-y-4 pt-4">
          <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
            {getPetIcon(petType)}
          </div>
          <div>
            <p className="text-lg font-medium">{petName || "Your Pet"}</p>
            <p className="text-sm text-muted-foreground">Pairing Code: {device.pairing_code}</p>
          </div>
        </div>

        {/* Pet Name Input */}
        <div className="space-y-2">
          <Label htmlFor="petName">Pet Name</Label>
          <Input
            id="petName"
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            placeholder="Enter your pet's name..."
            className="text-lg"
            maxLength={30}
          />
        </div>

        {/* Pet Type Selection */}
        <div className="space-y-3">
          <Label>Pet Type</Label>
          <div className="grid grid-cols-3 gap-3">
            {(['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setPetType(type)}
                className={`p-5 rounded-lg border-2 transition-all relative ${
                  petType === type 
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-center">
                  {getPetIcon(type, 40)}
                </div>
                {petType === type && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            Selected: {petType}
          </p>
        </div>

        {/* Save Button */}
        {hasChanges && (
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !petName.trim()}
            className="w-full h-12"
          >
            {isSaving ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </div>
            ) : (
              "Save Changes"
            )}
          </Button>
        )}

        {/* Danger Zone */}
        <div className="pt-8 space-y-4">
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Unpair your device to connect it to a different account or reset your pet.
            </p>
            <Button 
              variant="destructive" 
              onClick={() => setShowUnpairDialog(true)}
              className="w-full h-12"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Unpair Device
            </Button>
          </div>
        </div>
      </div>

      {/* Unpair Confirmation Dialog */}
      <Dialog open={showUnpairDialog} onOpenChange={setShowUnpairDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unpair Device?</DialogTitle>
            <DialogDescription>
              This will disconnect your {petName || "pet"} from your account. You can pair it again later using the same pairing code, or pair a different device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUnpairDialog(false)}
              disabled={isUnpairing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnpair}
              disabled={isUnpairing}
            >
              {isUnpairing ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Unpairing...</span>
                </div>
              ) : (
                "Unpair Device"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

