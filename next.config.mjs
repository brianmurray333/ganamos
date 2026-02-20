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
      { source: '/molt', destination: '/api', permanent: true },
      { source: '/ai', destination: '/api', permanent: true },
      { source: '/agent', destination: '/api', permanent: true },
      { source: '/mcp', destination: '/api', permanent: true },
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
