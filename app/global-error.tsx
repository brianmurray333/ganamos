'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console for debugging
    console.error('🚨 Global error caught:', error)
  }, [error])

  // Use inline styles to avoid dependency on UI components that might be broken
  return (
    <html>
      <head>
        <title>Ganamos - Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Background Image with Gradient Overlay */}
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0
        }}>
          <img
            src="/images/community-fixing.jpg"
            alt="Community background"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0.3), transparent)'
          }} />
        </div>

        {/* Content Container */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          {/* Ganamos Logo/Title - OUTSIDE the modal like login page */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{
              fontFamily: '"Pacifico", cursive',
              fontSize: '4.5rem',
              color: 'white',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
              margin: 0,
              paddingBottom: '0.625rem'
            }}>
              Ganamos!
            </h1>
          </div>

          {/* Error Modal */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            padding: '2.5rem',
            maxWidth: '28rem',
            width: '100%',
            textAlign: 'center'
          }}>
            {/* Error Icon */}
            <div style={{
              width: '4rem',
              height: '4rem',
              margin: '0 auto 1.5rem',
              backgroundColor: '#fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
            </div>

            {/* Error Message */}
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '0.75rem'
            }}>
              Oops! Something went wrong
            </h2>
            <p style={{
              fontSize: '0.95rem',
              color: '#6b7280',
              marginBottom: '2rem',
              lineHeight: '1.5'
            }}>
              We encountered an unexpected error. Please refresh your browser to continue.
            </p>

            {/* Refresh Button */}
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                fontSize: '1rem',
                fontWeight: '500',
                color: 'white',
                backgroundColor: '#16a34a',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'background-color 0.2s',
                marginBottom: '0.75rem'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#15803d'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#16a34a'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Refresh Page
            </button>

            {/* Secondary Action - Go Home */}
            <button
              onClick={() => window.location.href = '/'}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                fontSize: '1rem',
                fontWeight: '500',
                color: '#16a34a',
                backgroundColor: 'transparent',
                border: '1px solid #16a34a',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f0fdf4'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              Go to Home
            </button>

            {/* Error Details (only in dev) */}
            {process.env.NODE_ENV === 'development' && (
              <details style={{
                marginTop: '1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                padding: '1rem',
                borderRadius: '6px'
              }}>
                <summary style={{ cursor: 'pointer', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Error Details (Development Only)
                </summary>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '0.7rem',
                  margin: 0
                }}>
                  {error.message}
                  {error.digest && `\nDigest: ${error.digest}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
