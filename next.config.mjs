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
  async headers() {
    // Enable cross-origin isolation on wallet pages so Wavelength worker can use OPFS/SharedArrayBuffer.
    // Scope as narrowly as possible to avoid impacting unrelated routes that might load third-party assets.
    return [
      {
        source: "/wallet/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        source: "/signet-wallet.html",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        // Ensure runtime binaries served from /public/wavewalletdk/... are treated as same-origin resources
        source: "/wavewalletdk/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ]
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
