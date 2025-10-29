import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ConditionalThemeProvider } from "@/components/conditional-theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { NotificationsProvider } from "@/components/notifications-provider"
import { BottomNav } from "@/components/bottom-nav"
import { AuthProvider } from "@/components/auth-provider"
import { DashboardCacheProvider } from "@/components/dashboard-cache-provider"

const inter = Inter({ subsets: ["latin"] })

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Ganamos!",
  description: "Fix your community, earn Bitcoin",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
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
        <script src="https://hive.sphinx.chat/js/staktrak.js" async></script>
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <DashboardCacheProvider>
            <ConditionalThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
            >
              <main className="min-h-[calc(100vh-4rem)] pb-16 mx-auto">
                {children}
              </main>
              <BottomNav />
            </ConditionalThemeProvider>
            <NotificationsProvider>
              <Toaster />
            </NotificationsProvider>
          </DashboardCacheProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
