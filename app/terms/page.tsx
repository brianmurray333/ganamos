import type { Metadata } from "next"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Terms of Service - Ganamos",
  description: "Terms of Service for Ganamos - Learn about the terms governing your use of our platform",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      {/* Hero Background */}
      <div 
        className="relative w-full h-64 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/images/community-fixing.jpg')",
        }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center text-white">
            <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
            <p className="text-lg opacity-90">Governing your use of our platform</p>
          </div>
        </div>
      </div>

      {/* Terms of Service Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card className="shadow-lg bg-white">
          <CardContent className="p-8 prose prose-lg max-w-none">
            <div className="text-sm text-gray-600 mb-6">
              <strong>Effective Date:</strong> June 1st, 2025
            </div>

            <p className="text-gray-700 mb-6">
              Welcome to Ganamos! These Terms of Service ("Terms") govern your use of our platform, including the website <a href="https://www.ganamos.earth" className="text-emerald-600 hover:text-emerald-700 underline">https://www.ganamos.earth</a> and any authentication or participation services we offer (collectively, the "Service").
            </p>

            <p className="text-gray-700 mb-6">
              By using our Service, you agree to these Terms. If you do not agree, please do not use the platform.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Who We Are</h2>
            <p className="text-gray-700 mb-4">
              Ganamos is a civic engagement platform that allows users to sign in, participate in activities, and contribute to causes through gamified features. Access is provided securely via phone number or email authentication.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Account and Access</h2>
            <p className="text-gray-700 mb-4">To use Ganamos, you must:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Provide a valid phone number or email address for verification.</li>
              <li>Consent to receive one-time authentication messages (SMS or email) to access your account.</li>
              <li>You are responsible for maintaining the security of your login credentials and restricting access to your account.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Acceptable Use</h2>
            <p className="text-gray-700 mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Use Ganamos for any unlawful, fraudulent, or abusive purpose.</li>
              <li>Attempt to interfere with the Service's functionality or security.</li>
              <li>Harvest or misuse data from the platform.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Messaging and Communications</h2>
            <p className="text-gray-700 mb-4">
              By entering your phone number or email you consent to receive a one-time verification message each time you log in. Message and data rates may apply for SMS; standard email terms apply for email.
            </p>
            <p className="text-gray-700 mb-4">
              You can opt out of further messages by replying "STOP" (SMS) or requesting deletion via support.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Privacy and Data Use</h2>
            <p className="text-gray-700 mb-4">
              Your use of the Service is governed by our <a href="/privacy" className="text-emerald-600 hover:text-emerald-700 underline">Privacy Policy</a>, which explains how we collect and handle your data.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Intellectual Property</h2>
            <p className="text-gray-700 mb-4">
              All Ganamos content and branding, including the name, logo, and interface designs, are owned by us or our licensors. You may not use them without permission.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Limitation of Liability</h2>
            <p className="text-gray-700 mb-4">
              Ganamos is provided "as is", without warranties of any kind. We are not liable for any damages resulting from:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Inability to access the Service,</li>
              <li>Unauthorized access to your account,</li>
              <li>Bugs or service interruptions.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. Termination</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to suspend or terminate your access if you violate these Terms or misuse the Service.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">9. Modifications</h2>
            <p className="text-gray-700 mb-4">
              We may revise these Terms at any time. Continued use of Ganamos after changes are posted constitutes your acceptance.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">10. Contact</h2>
            <p className="text-gray-700 mb-4">
              Questions? Reach us at <a href="mailto:support@ganamos.earth" className="text-emerald-600 hover:text-emerald-700 underline">support@ganamos.earth</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 