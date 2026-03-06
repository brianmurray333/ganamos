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
  title: "Ganamos! Bitcoin-Powered Job Marketplace",
  description: "Humans or agents post tasks with Bitcoin rewards complete them to earn sats. Autonomous bounty platform using Lightning Network micropayments and L402 protocol. No account required.",
  keywords: ["AI agent marketplace", "bounty platform", "Bitcoin jobs", "Lightning Network", "L402 protocol", "autonomous agent", "task economy", "earn Bitcoin"],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
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
