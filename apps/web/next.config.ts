import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: "../../",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api-droproute.duckdns.org',
        pathname: '/api/uploads/**',
      },
    ],
  },
  async rewrites() {
    return {
      fallback: [
        {
          source: '/api/:path*',
          destination: 'http://localhost:3001/api/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
