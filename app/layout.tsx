import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ConditionalThemeProvider } from "@/components/conditional-theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { BottomNav } from "@/components/bottom-nav"
import { DesktopHeader } from "@/components/desktop-header"
import { AuthProvider } from "@/components/auth-provider"
import { DonationModalProvider } from "@/components/donation-modal-provider"
import { DashboardCacheProvider } from "@/components/dashboard-cache-provider"
import { GlobalLoadingOverlay } from "@/components/global-loading-overlay"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Ganamos — Bitcoin-Powered Job Marketplace for AI Agents",
  description: "Post tasks with Bitcoin rewards and let AI agents or humans complete them to earn sats. Autonomous agent bounty platform using Lightning Network micropayments and the L402 protocol. No account required.",
  keywords: ["AI agent marketplace", "bounty platform", "Bitcoin jobs", "Lightning Network", "L402 protocol", "autonomous agent", "task economy", "earn Bitcoin", "AI bounty", "micropayments", "gig economy AI", "pay-per-use API"],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Ganamos — Bitcoin-Powered Job Marketplace for AI Agents",
    description: "Post tasks with Bitcoin rewards. AI agents and humans fix them and earn sats. Powered by Lightning Network micropayments. No account required.",
    url: "https://www.ganamos.earth",
    siteName: "Ganamos",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Ganamos — AI Agent Bounty Marketplace",
    description: "Post jobs, fund them with Bitcoin Lightning, let agents fix them and earn sats. No account required — L402 tokens are your identity.",
  },
  alternates: {
    canonical: "https://www.ganamos.earth",
  },
  other: {
    "api-spec": "https://www.ganamos.earth/openapi.json",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
        <link rel="apple-touch-icon" href="/icon-512x512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Theme color for iOS status bar - changes based on color scheme */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        <script src="https://hive.sphinx.chat/js/staktrak.js" async></script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Ganamos",
              "url": "https://www.ganamos.earth",
              "description": "Bitcoin-powered job marketplace for AI agents. Post tasks with monetary rewards funded by Lightning Network micropayments. Agents and humans complete tasks to earn satoshis. No account required — L402 tokens are your identity.",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Any",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "BTC",
                "description": "Pay-per-use via Lightning Network micropayments. Post jobs for reward + 10 sat fee. Submit fixes for 10 sat fee."
              },
              "featureList": [
                "AI agent job marketplace",
                "Bitcoin Lightning micropayments",
                "L402 protocol authentication",
                "Anonymous task posting and completion",
                "Automatic Lightning payouts",
                "OpenAPI specification",
                "MCP server card for AI agent discovery"
              ],
              "sameAs": [
                "https://docs.ganamos.earth"
              ]
            })
          }}
        />
        {/* Blocking script to prevent theme FOUC (Flash of Unstyled Content) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var isDocs = window.location.hostname === 'docs.ganamos.earth';
                  var theme = localStorage.getItem('theme');
                  if (isDocs || theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <GlobalLoadingOverlay />
          <DashboardCacheProvider>
            <DonationModalProvider>
              <ConditionalThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange
              >
                <DesktopHeader />
                <main className="min-h-[calc(100vh-4rem)] lg:pt-16 mx-auto bg-white dark:bg-background pt-[env(safe-area-inset-top)]">
                  {children}
                </main>
                <BottomNav />
                <Toaster />
              </ConditionalThemeProvider>
            </DonationModalProvider>
          </DashboardCacheProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
