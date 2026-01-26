import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase'

type Props = {
  params: { id: string }
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Set a short timeout to prevent blocking
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 2000) // 2 second timeout
  })

  const supabase = createServerSupabaseClient()
  
  try {
    // Race between the database query and the timeout
    const postPromise = supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .single()

    const result = await Promise.race([postPromise, timeout])
    
    // If timeout won, return default metadata with post ID
    if (!result) {
      console.warn('Metadata generation timed out for post:', params.id)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                      (process.env.NODE_ENV === 'production' ? 'https://ganamos.earth' : 'http://localhost:3457')
      return {
        title: 'Community Issue | Ganamos!',
        description: 'Help fix this community issue and earn Bitcoin!',
        openGraph: {
          title: 'Community Issue',
          description: 'Help fix this community issue and earn Bitcoin!',
          url: `${baseUrl}/post/${params.id}`,
          siteName: 'Ganamos!',
          images: [
            {
              url: `${baseUrl}/placeholder.jpg`,
              width: 1200,
              height: 630,
              alt: 'Community Issue',
            },
          ],
          locale: 'en_US',
          type: 'website',
        },
        twitter: {
          card: 'summary_large_image',
          title: 'Community Issue',
          description: 'Help fix this community issue and earn Bitcoin!',
          images: [`${baseUrl}/placeholder.jpg`],
        },
      }
    }

    const { data: post, error } = result

    if (error || !post) {
      return {
        title: 'Post Not Found | Ganamos!',
        description: 'This post could not be found.',
      }
    }

    const imageUrl = post.image_url || post.imageUrl
    const title = post.title || 'Community Issue'
    const description = post.description || 'Help fix this community issue and earn Bitcoin!'
    const location = post.city || post.location || 'Unknown location'
    const reward = post.reward || 0
    
    // Format the description with location and reward
    const fullDescription = `${description} • ${location} • ${reward} sats reward`
    
    // Construct the full URL for the post
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (process.env.NODE_ENV === 'production' ? 'https://ganamos.earth' : 'http://localhost:3457')
    const url = `${baseUrl}/post/${params.id}`
    
    // Use the post image for OG image, or fallback to a default
    const ogImage = imageUrl || `${baseUrl}/placeholder.jpg`

    return {
      title: `${title} | Ganamos!`,
      description: fullDescription,
      openGraph: {
        title: title,
        description: fullDescription,
        url: url,
        siteName: 'Ganamos!',
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
        locale: 'en_US',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: title,
        description: fullDescription,
        images: [ogImage],
      },
      alternates: {
        canonical: url,
      },
    }
  } catch (error) {
    console.error('Error generating metadata:', error)
    // Return default metadata on error instead of crashing
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (process.env.NODE_ENV === 'production' ? 'https://ganamos.earth' : 'http://localhost:3457')
    return {
      title: 'Community Issue | Ganamos!',
      description: 'Help fix this community issue and earn Bitcoin!',
      openGraph: {
        title: 'Community Issue',
        description: 'Help fix this community issue and earn Bitcoin!',
        url: `${baseUrl}/post/${params.id}`,
        siteName: 'Ganamos!',
        images: [
          {
            url: `${baseUrl}/placeholder.jpg`,
            width: 1200,
            height: 630,
            alt: 'Community Issue',
          },
        ],
        locale: 'en_US',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Community Issue',
        description: 'Help fix this community issue and earn Bitcoin!',
        images: [`${baseUrl}/placeholder.jpg`],
      },
    }
  }
}

export default function PostLayout({ children }: Props) {
  return <>{children}</>
}

