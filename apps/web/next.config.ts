import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: "../../",
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
