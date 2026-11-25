import { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  // Resolves the Open Graph image (opengraph-image.jpg, a 3D render of the
  // device) and the looping video to absolute URLs
  metadataBase: new URL("https://satoshipet.com"),
  title: "Satoshi Pet - Make Bitcoin Physical & Fun",
  description: "A cute hardware companion that reacts to your Bitcoin activity. Perfect for making Bitcoin tangible for the whole family.",
  keywords: ["bitcoin", "hardware", "education", "kids", "satoshi", "pet", "lightning"],
  authors: [{ name: "Ganamos" }],
  icons: {
    icon: "/satoshi-pet-favicon.svg",
    apple: "/satoshi-pet-favicon.svg",
  },
  openGraph: {
    title: "Satoshi Pet - Make Bitcoin Physical & Fun",
    description: "A cute hardware companion that reacts to your Bitcoin activity. Perfect for making Bitcoin tangible for the whole family.",
    url: "https://satoshipet.com",
    siteName: "Satoshi Pet",
    type: "website",
    // A 5 s loop of the same render; iMessage, Discord and Telegram play it, others show the image
    videos: [{ url: "/satoshi-pet/og-loop.mp4", type: "video/mp4", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Satoshi Pet - Make Bitcoin Physical & Fun",
    description: "A cute hardware companion that reacts to your Bitcoin activity.",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: "#8b5cf6", // Purple to match the pet branding
}

export default function SatoshiPetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This layout provides metadata for SEO. The bottom nav is hidden via 
  // the pathname check in bottom-nav.tsx
  return <>{children}</>
}

