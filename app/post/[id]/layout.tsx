import type { Metadata } from 'next'

type Props = {
  params: { id: string }
  children: React.ReactNode
}

// Static metadata - no database call, so navigation is instant
// The skeleton loader shows immediately while the page fetches data client-side
// Trade-off: Social sharing previews use generic text instead of post-specific content
// This is acceptable because:
// 1. User navigation (99% of visits) is now instant
// 2. Social crawlers still get valid OG tags, just not personalized
export function generateMetadata({ params }: Props): Metadata {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                  (process.env.NODE_ENV === 'production' ? 'https://ganamos.earth' : 'http://localhost:3457')
  const url = `${baseUrl}/post/${params.id}`
  
  return {
    title: 'Community Issue | Ganamos!',
    description: 'Help fix this community issue and earn Bitcoin!',
    openGraph: {
      title: 'Community Issue',
      description: 'Help fix this community issue and earn Bitcoin!',
      url: url,
      siteName: 'Ganamos!',
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: 'Ganamos - Fix issues, earn Bitcoin',
        },
      ],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Community Issue',
      description: 'Help fix this community issue and earn Bitcoin!',
      images: [`${baseUrl}/og-image.png`],
    },
    alternates: {
      canonical: url,
    },
  }
}

export default function PostLayout({ children }: Props) {
  return <>{children}</>
}

