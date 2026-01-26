"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Check, Star, Shield, Zap, Heart, Package } from "lucide-react"
import Image from "next/image"

export default function PetStorePage() {
  const router = useRouter()
  const [isOrdering, setIsOrdering] = useState(false)

  const handleOrder = () => {
    setIsOrdering(true)
    // Simulate order process
    setTimeout(() => {
      setIsOrdering(false)
      alert("Order placed! You'll receive your Satoshi Pet in 3-5 business days.")
      router.back()
    }, 2000)
  }

  const features = [
    {
      icon: <Heart className="h-5 w-5" />,
      title: "Real Bitcoin Connection",
      description: "Syncs with your actual Bitcoin balance in real-time"
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Educational & Fun",
      description: "Teaches kids Bitcoin concepts through interactive play"
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Secure Hardware",
      description: "Military-grade encryption keeps your connection safe"
    },
    {
      icon: <Package className="h-5 w-5" />,
      title: "Long Battery Life",
      description: "Up to 2 weeks on a single charge with USB-C charging"
    }
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Floating Back Button */}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => router.back()}
        className="fixed top-4 left-4 z-50 bg-background/80 backdrop-blur-sm border shadow-sm"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="max-w-md mx-auto p-4 pt-12 space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="w-40 h-40 mx-auto bg-gradient-to-br from-orange-400 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
            <div className="text-6xl">🐾</div>
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2">Satoshi Pet Hardware</h1>
            <p className="text-muted-foreground">The physical companion that makes Bitcoin real for your family</p>
          </div>
        </div>

        {/* Price & Badge */}
        <Card>
          <CardContent className="p-6 text-center">
            <Badge variant="secondary" className="mb-3">Limited Edition</Badge>
            <div className="text-4xl font-bold mb-2">$49.00</div>
            <p className="text-sm text-muted-foreground">Free shipping • 30-day money back guarantee</p>
          </CardContent>
        </Card>

        {/* Product Features */}
        <Card>
          <CardHeader>
            <CardTitle>What's Included</CardTitle>
            <CardDescription>Everything you need to make Bitcoin tangible</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                  {feature.icon}
                </div>
                <div>
                  <h4 className="font-medium">{feature.title}</h4>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Specs */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Specifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Dimensions</span>
              <span className="text-sm font-medium">2.5" x 1.5" x 0.5"</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Weight</span>
              <span className="text-sm font-medium">2.1 oz (60g)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Display</span>
              <span className="text-sm font-medium">1.3" OLED Color Screen</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Connectivity</span>
              <span className="text-sm font-medium">Bluetooth 5.0, WiFi</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Battery</span>
              <span className="text-sm font-medium">400mAh Li-ion, USB-C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Compatibility</span>
              <span className="text-sm font-medium">iOS 14+, Android 8+</span>
            </div>
          </CardContent>
        </Card>

        {/* Reviews */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span>4.9/5</span>
            </CardTitle>
            <CardDescription>Based on 247 reviews</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              </div>
              <p className="text-sm font-medium">"My kids finally get Bitcoin!"</p>
              <p className="text-xs text-muted-foreground">
                "This device helped my 8-year-old understand that Bitcoin is real money. 
                She gets so excited when her pet reacts to earning sats!" - Sarah M.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              </div>
              <p className="text-sm font-medium">"Brilliant educational tool"</p>
              <p className="text-xs text-muted-foreground">
                "Perfect way to teach the family about Bitcoin. The hardware quality is excellent 
                and setup was super easy." - Mike R.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Order Button */}
        <Button 
          onClick={handleOrder} 
          disabled={isOrdering}
          className="w-full h-12 text-lg"
          size="lg"
        >
          {isOrdering ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Processing Order...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5" />
              <span>Order Now - $49.00</span>
            </div>
          )}
        </Button>

        {/* Footer Info */}
        <div className="text-center space-y-2 pb-8">
          <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Check className="h-4 w-4 text-green-600" />
              <span>Free Shipping</span>
            </div>
            <div className="flex items-center space-x-1">
              <Check className="h-4 w-4 text-green-600" />
              <span>30-Day Returns</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ships within 3-5 business days • Made in USA
          </p>
        </div>
      </div>
    </div>
  )
}
