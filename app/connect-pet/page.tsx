"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Wifi, Bluetooth, Zap, Heart, Cat, Dog, Rabbit, Squirrel, Turtle, Package } from "lucide-react"
import { OwlIcon } from "@/components/icons/owl-icon"
import Image from "next/image"
import { toast } from "sonner"

export default function ConnectPetPage() {
  const router = useRouter()
  const { profile, activeUserId, user, isConnectedAccount } = useAuth()
  const [isConnecting, setIsConnecting] = useState(false)
  const [deviceCode, setDeviceCode] = useState("")
  const [selectedPet, setSelectedPet] = useState<'cat' | 'dog' | 'rabbit' | 'squirrel' | 'turtle' | 'owl'>('cat')
  const [petName, setPetName] = useState("")
  const [step, setStep] = useState<'get-started' | 'choose-pet' | 'name-pet' | 'connect-device'>('get-started')
  const [showCodeEntry, setShowCodeEntry] = useState(false)


  const handleConnect = async () => {
    if (!deviceCode || !petName) {
      alert("Please enter a device code and pet name")
      return
    }
    
    setIsConnecting(true)
    
    try {
      const response = await fetch('/api/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceCode: deviceCode.toUpperCase(),
          petName,
          petType: selectedPet,
          targetUserId: activeUserId || user?.id || null,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success("Pet Connected!", {
          description: result.message,
        })
        // Redirect to profile page to see the new pet
        router.push('/profile')
      } else {
        toast.error("Connection Failed", {
          description: result.error,
        })
      }
    } catch (error) {
      console.error('Connection error:', error)
      toast.error("Connection Error", {
        description: "Failed to connect device. Please try again.",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const getPetIcon = (petType: string, size: number = 80, color: string = "white") => {
    const iconProps = { size, color, strokeWidth: 1.5 }
    switch (petType) {
      case 'dog': return <Dog {...iconProps} />
      case 'rabbit': return <Rabbit {...iconProps} />
      case 'squirrel': return <Squirrel {...iconProps} />
      case 'turtle': return <Turtle {...iconProps} />
      case 'owl': return <OwlIcon size={size} color={color} />
      default: return <Cat {...iconProps} />
    }
  }

  const getCurrentBalance = () => {
    return profile?.balance || 0
  }

  const getAccountStatus = () => {
    if (isConnectedAccount) {
      return `Connected Account (${profile?.name || 'Unknown'})`
    }
    return `Main Account (${user?.user_metadata?.full_name || 'You'})`
  }

  const handleNext = () => {
    if (step === 'get-started') setStep('choose-pet')
    else if (step === 'choose-pet') setStep('name-pet')
    else if (step === 'name-pet') setStep('connect-device')
  }

  const handleBack = () => {
    if (step === 'choose-pet') setStep('get-started')
    else if (step === 'name-pet') setStep('choose-pet')
    else if (step === 'connect-device') {
      if (showCodeEntry) {
        // Go back to Pair/Order options instead of previous step
        setShowCodeEntry(false)
      } else {
        setStep('name-pet')
      }
    }
    else router.back()
  }

  const canProceed = () => {
    if (step === 'get-started') return true
    if (step === 'choose-pet') return selectedPet
    if (step === 'name-pet') return petName.trim().length > 0
    if (step === 'connect-device') return deviceCode.length === 6
    return false
  }

  const getStepTitle = () => {
    switch (step) {
      case 'get-started': return 'Satoshi Pet'
      case 'choose-pet': return 'Choose Your Pet'
      case 'name-pet': return 'Name Your Pet'
      case 'connect-device': return 'Connect Pet'
      default: return 'Satoshi Pet'
    }
  }

  const getStepDescription = () => {
    switch (step) {
      case 'get-started': return 'Make Bitcoin physical and fun'
      case 'choose-pet': return null
      case 'name-pet': return null
      case 'connect-device': return null
      default: return ''
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Floating Back Button */}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleBack}
        className="fixed top-4 left-4 z-50 bg-background/80 backdrop-blur-sm border shadow-sm"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="max-w-md mx-auto p-4 pt-16 min-h-screen flex flex-col">
        {/* Step Content */}
        <div className="flex-1 flex flex-col space-y-8">
          {step === 'get-started' && (
            <div className="space-y-8">
              {/* Hero Visual */}
              <div className="text-center space-y-4">
                <div className="relative w-32 h-32 mx-auto">
                  {/* Bitcoin Coins - Raining down into cat's circle */}
                  {/* Left coin */}
                  <div className="absolute w-6 h-6 border-2 border-white rounded-full flex items-center justify-center text-xs font-bold text-white top-0 transform -translate-x-1/2" style={{ left: '15%', animation: 'coinRain 3s ease-in-out infinite, coinFade 3s ease-in-out infinite', opacity: 0 }}>
                    ₿
                  </div>
                  
                  {/* Center coin */}
                  <div className="absolute w-6 h-6 border-2 border-white rounded-full flex items-center justify-center text-xs font-bold text-white top-0 left-1/2 transform -translate-x-1/2" style={{ animation: 'coinRain 3s ease-in-out infinite, coinFade 3s ease-in-out infinite', animationDelay: '1s, 1s', opacity: 0 }}>
                    ₿
                  </div>
                  
                  {/* Right coin */}
                  <div className="absolute w-6 h-6 border-2 border-white rounded-full flex items-center justify-center text-xs font-bold text-white top-0 transform -translate-x-1/2" style={{ left: '75%', animation: 'coinRain 3s ease-in-out infinite, coinFade 3s ease-in-out infinite', animationDelay: '2s, 2s', opacity: 0 }}>
                    ₿
                  </div>

                  {/* Main Cat Circle */}
                  <div className="relative w-32 h-32 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center overflow-hidden">
                    {/* Subtle background glow effect */}
                    <div className="absolute inset-2 bg-white/10 rounded-full animate-pulse" style={{ animationDuration: '3s' }}></div>
                    
                    {/* Animated Cat Icon */}
                    <div 
                      className="relative z-10"
                      style={{
                        animation: 'float 4s ease-in-out infinite, wiggle 6s ease-in-out infinite'
                      }}
                    >
                      <Cat size={80} color="white" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{getStepTitle()}</h1>
                  <p className="text-muted-foreground">{getStepDescription()}</p>
                </div>
              </div>

              {/* Custom CSS for animations */}
              <style jsx>{`
                @keyframes float {
                  0%, 100% { transform: translateY(0px) scale(1); }
                  25% { transform: translateY(-3px) scale(1.02); }
                  50% { transform: translateY(-6px) scale(1.05); }
                  75% { transform: translateY(-3px) scale(1.02); }
                }
                
                @keyframes wiggle {
                  0%, 100% { transform: translateX(0px) rotate(0deg); }
                  10% { transform: translateX(-5px) rotate(-3deg); }
                  20% { transform: translateX(5px) rotate(3deg); }
                  30% { transform: translateX(-3px) rotate(-1.5deg); }
                  40% { transform: translateX(3px) rotate(1.5deg); }
                  50% { transform: translateX(0px) rotate(0deg); }
                  60% { transform: translateX(-3px) rotate(-1.5deg); }
                  70% { transform: translateX(3px) rotate(1.5deg); }
                  80% { transform: translateX(-5px) rotate(-3deg); }
                  90% { transform: translateX(5px) rotate(3deg); }
                }
                
                @keyframes coinRain {
                  0% { transform: translateY(-60px); }
                  100% { transform: translateY(80px); }
                }
                
                @keyframes coinFade {
                  0% { opacity: 0; }
                  20% { opacity: 1; }
                  80% { opacity: 1; }
                  100% { opacity: 0; }
                }
                

              `}</style>

              {/* Features */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Heart className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">Your pet reacts when you earn or spend sats</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">Kids learn Bitcoin concepts through play</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <Wifi className="h-5 w-5 text-purple-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">Carry Bitcoin everywhere as a physical reminder</p>
                </div>
              </div>
            </div>
          )}

          {step !== 'get-started' && (
            <>
              {/* Header for other steps */}
              <div className="text-center space-y-2 mb-4">
                <h1 className="text-2xl font-bold">{getStepTitle()}</h1>
                {getStepDescription() && (
                  <p className="text-muted-foreground">{getStepDescription()}</p>
                )}
              </div>
            </>
          )}

          {step === 'choose-pet' && (
            <div className="space-y-6">
              {/* Pet Visual */}
              <div className="text-center">
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center mb-4">
                  {getPetIcon(selectedPet)}
                </div>
              </div>

              {/* Pet Selection */}
              <div className="grid grid-cols-3 gap-3">
                {(['cat', 'dog', 'rabbit', 'squirrel', 'turtle', 'owl'] as const).map((pet) => (
                  <button
                    key={pet}
                    onClick={() => setSelectedPet(pet)}
                    className={`p-5 rounded-lg border-2 transition-all flex items-center justify-center ${
                      selectedPet === pet 
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {getPetIcon(pet, 40, "currentColor")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'name-pet' && (
            <div className="space-y-6">
              {/* Pet Visual */}
              <div className="text-center">
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center mb-4">
                  {getPetIcon(selectedPet)}
                </div>
              </div>

              {/* Pet Name Input */}
              <div className="space-y-3">
                <Input
                  id="petName"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && petName.trim().length > 0) {
                      setStep('connect-device')
                    }
                  }}
                  placeholder="Enter your pet's name..."
                  className="text-center text-lg"
                  autoFocus
                  enterKeyHint="done"
                />
              </div>
            </div>
          )}

          {step === 'connect-device' && (
            <div className="space-y-6">
              {/* Pet Visual */}
              <div className="text-center">
                <div className="relative mx-auto mb-4" style={{ width: '128px', height: '128px' }}>
                  {/* Sonar Rings */}
                  <div className="absolute inset-0 rounded-full border-2 border-purple-400/30 animate-ping" style={{ animationDuration: '2s' }}></div>
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}></div>
                  <div className="absolute inset-0 rounded-full border-2 border-blue-400/20 animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }}></div>
                  
                  {/* Main Pet Circle */}
                  <div className="w-32 h-32 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center relative z-10">
                    {getPetIcon(selectedPet)}
                  </div>
                </div>
                <p className="text-lg font-medium">{petName}</p>
                <p className="text-sm text-foreground animate-pulse">Ready to connect</p>
              </div>

              {!showCodeEntry ? (
                /* Initial Options */
                <div className="space-y-4">
                  <Button 
                    onClick={() => setShowCodeEntry(true)}
                    className="w-full h-12 text-lg text-white"
                  >
                    <Wifi className="h-5 w-5 mr-2" />
                    Pair My Pet
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => window.open('https://satoshipet.com', '_blank')}
                    className="w-full h-12 text-lg"
                  >
                    <Package className="h-5 w-5 mr-2" />
                    Order Pet - $49
                  </Button>
                </div>
              ) : (
                /* Code Entry */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      id="deviceCode"
                      value={deviceCode}
                      onChange={(e) => setDeviceCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && deviceCode.length === 6) {
                          handleConnect()
                        }
                      }}
                      placeholder="Enter pairing code"
                      maxLength={6}
                      className="text-center text-l tracking-widest font-mono"
                      autoFocus
                      enterKeyHint="done"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Action Button */}
        <div className="mt-auto pb-32">
          {step === 'connect-device' && showCodeEntry ? (
            <Button 
              onClick={handleConnect} 
              disabled={isConnecting || !canProceed()}
              className="w-full h-12 text-lg text-white"
            >
              {isConnecting ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Connecting {petName}...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Wifi className="h-5 w-5" />
                  <span>Connect {petName}</span>
                </div>
              )}
            </Button>
          ) : step !== 'connect-device' ? (
            <Button 
              onClick={handleNext} 
              disabled={!canProceed()}
              className="w-full h-12 text-lg text-white"
            >
              {step === 'get-started' && 'Get Started'}
              {step === 'choose-pet' && 'Continue'}
              {step === 'name-pet' && 'Continue'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
