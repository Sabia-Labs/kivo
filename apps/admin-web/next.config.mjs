/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments.
  // Produces .next/standalone/ with a minimal self-contained Node.js server.
  output: 'standalone',

  // Proxy /api/* requests to the backend API service.
  //
  // In Kubernetes: the Next.js server (inside the pod) forwards requests to
  //   kivo-api:4000 via ClusterIP — the API is never exposed externally.
  // In local bare-metal dev (make web): falls back to localhost:4000.
  //
  // The browser always calls /api/* on the same origin — no CORS issues,
  // no need to expose the API through the Ingress.
  async rewrites() {
    const apiBase =
      process.env.API_INTERNAL_URL ?? 'http://localhost:4001'
    return [
      {
        source: '/admin-api/:path*',
        destination: `${apiBase}/:path*`,
      },
    ]
  },
}

export default nextConfig

