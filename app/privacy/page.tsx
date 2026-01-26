import type { Metadata } from "next"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Privacy Policy - Ganamos",
  description: "Privacy Policy for Ganamos - Learn how we protect your personal information",
}

export default function PrivacyPage() {
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
            <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-lg opacity-90">How we protect your information</p>
          </div>
        </div>
      </div>

      {/* Privacy Policy Content */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Card className="shadow-lg bg-white">
          <CardContent className="p-8 prose prose-lg max-w-none">
            <div className="text-sm text-gray-600 mb-6">
              <strong>Effective Date:</strong> June 1st, 2025
            </div>

            <p className="text-gray-700 mb-6">
              Ganamos ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy describes how we collect, use, and share your personal information when you use our platform, including our website <a href="https://www.ganamos.earth" className="text-emerald-600 hover:text-emerald-700 underline">https://www.ganamos.earth</a> (the "Site") and associated services (collectively, the "Service").
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>
            <p className="text-gray-700 mb-4">
              We collect only the minimum information necessary to provide a secure, engaging login experience and to support civic participation through our platform.
            </p>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">a. Identifiers</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Phone Number:</strong> Used to authenticate your identity through a one-time SMS code.</li>
              <li><strong>Email Address:</strong> If you choose to sign in with email, we collect your email address and use it to verify and manage your account access.</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">b. Device and Usage Information</h3>
            <p className="text-gray-700 mb-4">
              IP address, browser type, device type, and login timestamp are automatically recorded when you use our service.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 mb-4">We use your information to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Authenticate you via SMS or email.</li>
              <li>Enable access to your Ganamos profile.</li>
              <li>Ensure the integrity and security of the login process.</li>
              <li>Prevent fraud or unauthorized access.</li>
              <li>Improve and maintain the functionality and reliability of our platform.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Communications</h2>
            <p className="text-gray-700 mb-4">By logging in, you consent to receive:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>One-time SMS or email verification codes (depending on your selected login method).</li>
              <li>Service-related notifications strictly necessary to operate the platform.</li>
              <li>You will not receive marketing messages from us unless you opt in separately.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Sharing and Disclosure</h2>
            <p className="text-gray-700 mb-4">We do not sell or rent your information.</p>
            <p className="text-gray-700 mb-4">We only share it with:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Service providers (e.g., Twilio, for SMS delivery; Supabase or similar platforms for identity management).</li>
              <li>Government authorities if legally required, such as in response to valid subpoenas or court orders.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Data Security</h2>
            <p className="text-gray-700 mb-4">We follow industry best practices to protect your personal information, including:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>End-to-end encryption of login data in transit.</li>
              <li>Role-based access controls within our systems.</li>
              <li>Periodic review of our access and storage policies.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Your Choices</h2>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Opt-out of messaging:</strong> You may reply "STOP" to any SMS message to prevent further delivery.</li>
              <li><strong>Delete your data:</strong> Contact us at <a href="mailto:support@ganamos.earth" className="text-emerald-600 hover:text-emerald-700 underline">support@ganamos.earth</a> to request account deletion or data export.</li>
            </ul>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Children's Privacy</h2>
            <p className="text-gray-700 mb-4">
              Ganamos is intended for use by individuals aged 13 and older. If we become aware that a user under 13 has registered, we will delete their data promptly.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. Updates to This Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy from time to time. Changes will be posted at this URL with an updated effective date.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">9. Contact Us</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions or concerns about this policy, email us at <a href="mailto:support@ganamos.earth" className="text-emerald-600 hover:text-emerald-700 underline">support@ganamos.earth</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 