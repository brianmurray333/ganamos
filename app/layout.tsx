import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Pacifico } from "next/font/google"
import "./globals.css"
import { ConditionalThemeProvider } from "@/components/conditional-theme-provider"
import { Toaster } from "@/components/ui/toast"
import { BottomNav } from "@/components/bottom-nav"
import { DesktopHeader } from "@/components/desktop-header"
import { MainContent } from "@/components/main-content"
import { AuthProvider } from "@/components/auth-provider"
import { DonationModalProvider } from "@/components/donation-modal-provider"
import { DashboardCacheProvider } from "@/components/dashboard-cache-provider"
import { GlobalLoadingOverlay } from "@/components/global-loading-overlay"
import { ImageFadeIn } from "@/components/image-fade-in"

const inter = Inter({ subsets: ["latin"] })
// Self-hosted (was a render-blocking Google Fonts stylesheet that delayed the
// first paint on PWA launch). Used via var(--font-pacifico).
const pacifico = Pacifico({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-pacifico" })

// iPhone portrait screens [CSS width, CSS height, pixel ratio] with a splash in /public/splash
const SPLASH_SCREENS: Array<[number, number, number]> = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3],
  [390, 844, 3], [414, 896, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2],
]

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
    <html lang="en" className={pacifico.variable} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
        <link rel="apple-touch-icon" href="/icon-512x512.png" />
        {/* iOS launch splash: shown instead of a black screen while the app loads */}
        {SPLASH_SCREENS.map(([w, h, dpr]) => (
          <link
            key={`${w}x${h}@${dpr}`}
            rel="apple-touch-startup-image"
            href={`/splash/launch-${w * dpr}x${h * dpr}.png`}
            media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
          />
        ))}
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
                  var dark = isDocs || theme === 'dark' || !theme ||
                    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (dark) {
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
          <ImageFadeIn />
          <DashboardCacheProvider>
            <DonationModalProvider>
              <ConditionalThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange
              >
                <DesktopHeader />
                <MainContent>
                  {children}
                </MainContent>
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
