"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Cat, Check, CheckCircle2, Wifi, Link2, Smartphone, 
  ArrowLeft, Package, ExternalLink 
} from "lucide-react"

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a 
              href="/satoshi-pet"
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-1" />
              <span className="hidden sm:inline">Back</span>
            </a>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
                <Cat size={18} color="white" strokeWidth={2} />
              </div>
              <span className="font-bold text-lg">Setup Guide</span>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = 'https://ganamos.earth/connect-pet'}
          >
            Connect Pet
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Cat size={40} color="white" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Satoshi Pet Setup Guide</h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            Get your Satoshi Pet connected and ready to react to your Bitcoin activity in just a few minutes.
          </p>
        </div>

        {/* Prerequisites */}
        <Card className="mb-8 border-amber-200 bg-amber-50">
          <CardContent className="p-6">
            <h2 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Before You Start
            </h2>
            <ul className="space-y-2 text-amber-800">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-1 flex-shrink-0" />
                <span>Unbox your Satoshi Pet device and USB-C charging cable</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-1 flex-shrink-0" />
                <span>Have your home WiFi network name and password ready</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 mt-1 flex-shrink-0" />
                <span>Make sure your phone/laptop can connect to WiFi</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Setup Steps */}
        <div className="space-y-8">
          {/* Step 1 */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-green-600 text-white px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <div>
                  <h3 className="font-bold text-lg">Create Your Account</h3>
                  <p className="text-green-100 text-sm">Set up your Ganamos wallet</p>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Smartphone className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-gray-700 mb-4">
                      Go to <a href="https://ganamos.earth" className="text-blue-600 hover:underline font-medium" target="_blank" rel="noopener noreferrer">ganamos.earth</a> and 
                      sign up for a free account. This is where you'll manage your Bitcoin balance and interact with your pet.
                    </p>
                    
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <p className="font-medium mb-2">During signup:</p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          Create a new pet (give it a name!)
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          Pick a pet type (cat, dog, rabbit, etc.)
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          You'll pair your physical device in Step 3
                        </li>
                      </ul>
                    </div>

                    <Button 
                      onClick={() => window.open('https://ganamos.earth/auth/register', '_blank')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Create Account
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-blue-600 text-white px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <div>
                  <h3 className="font-bold text-lg">Connect Pet to WiFi</h3>
                  <p className="text-blue-100 text-sm">Configure your device's network</p>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Wifi className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-gray-700 mb-4">
                      Power on your Satoshi Pet device. On first boot (or after a reset), it will create its own WiFi network that you'll connect to for setup.
                    </p>

                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="font-medium mb-2 flex items-center gap-2">
                          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">a</span>
                          Find the "SatoshiPet" network
                        </p>
                        <p className="text-sm text-gray-600 ml-8">
                          Open WiFi settings on your phone or laptop. Look for a network called <code className="bg-gray-200 px-1.5 py-0.5 rounded text-blue-600">SatoshiPet</code> and connect to it.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="font-medium mb-2 flex items-center gap-2">
                          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">b</span>
                          Enter your WiFi credentials
                        </p>
                        <p className="text-sm text-gray-600 ml-8">
                          A captive portal will automatically open (like when connecting to hotel WiFi). Enter your home WiFi network name and password.
                        </p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="font-medium mb-2 flex items-center gap-2">
                          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">c</span>
                          Wait for restart
                        </p>
                        <p className="text-sm text-gray-600 ml-8">
                          Your Satoshi Pet will restart and connect to your home WiFi. The screen will show a pairing code when it's ready.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">
                        <strong>Tip:</strong> If the captive portal doesn't open automatically, try opening your browser and going to <code className="bg-amber-100 px-1 rounded">192.168.4.1</code>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-purple-600 text-white px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <div>
                  <h3 className="font-bold text-lg">Pair Your Pet</h3>
                  <p className="text-purple-100 text-sm">Link the device to your account</p>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Link2 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-gray-700 mb-4">
                      Your device will display a 6-character pairing code on its screen once it's connected to WiFi. Use this code to link your physical device to your Ganamos account.
                    </p>

                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <p className="font-medium mb-2">To complete pairing:</p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          Note the 6-character code shown on your device screen
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          Go to <a href="https://ganamos.earth/connect-pet" className="text-blue-600 hover:underline">ganamos.earth/connect-pet</a>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          Enter the pairing code when prompted
                        </li>
                      </ul>
                    </div>

                    {/* Success State */}
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                        <div>
                          <p className="font-medium text-green-900">That's it! 🎉</p>
                          <p className="text-sm text-green-700">
                            Your Satoshi Pet is now connected. It will react when you earn or spend sats!
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button 
                      onClick={() => window.location.href = 'https://ganamos.earth/connect-pet'}
                      className="mt-4 bg-purple-600 hover:bg-purple-700"
                    >
                      Go to Connect Pet
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Troubleshooting */}
        <Card className="mt-8">
          <CardContent className="p-6">
            <h2 className="font-bold text-lg mb-4">Troubleshooting</h2>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-gray-900">Device won't turn on?</p>
                <p className="text-gray-600">Make sure it's charged. Connect via USB-C and wait a few minutes before trying again.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Can't find "SatoshiPet" network?</p>
                <p className="text-gray-600">Hold the reset button for 10 seconds to factory reset the device. It will restart in setup mode.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Pairing code not showing?</p>
                <p className="text-gray-600">Make sure the device is connected to WiFi and has internet access. Try restarting the device.</p>
              </div>
              <div>
                <p className="font-medium text-gray-900">Still having issues?</p>
                <p className="text-gray-600">Contact us at <a href="mailto:support@ganamos.earth" className="text-blue-600 hover:underline">support@ganamos.earth</a></p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">Don't have a Satoshi Pet yet?</p>
          <Button 
            size="lg"
            className="h-14 px-8 bg-green-600 hover:bg-green-700"
            onClick={() => window.location.href = '/satoshi-pet'}
          >
            Order Your Satoshi Pet
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Satoshi Pet. A product by <a href="https://ganamos.earth" className="text-gray-700 hover:underline">Ganamos</a></p>
        </div>
      </footer>
    </div>
  )
}

