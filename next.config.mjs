/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/dashboard', destination: '/', permanent: true },
      { source: '/molt', destination: '/docs', permanent: true },
      { source: '/ai', destination: '/docs', permanent: true },
      { source: '/agent', destination: '/docs', permanent: true },
      { source: '/mcp', destination: '/docs', permanent: true },
      { source: '/developers', destination: '/docs', permanent: false },
    ]
  },
  webpack: (config, { isServer }) => {
    // Suppress the webpack warning for Supabase Realtime library
    config.ignoreWarnings = [
      { module: /node_modules\/@supabase\/realtime-js/ },
    ]
    return config
  },
}

export default nextConfig
