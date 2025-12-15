import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // This connects to the Backend Vercel URL
        // We will set NEXT_PUBLIC_API_URL in the Vercel Dashboard
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`, 
      },
    ];
  },
};

export default nextConfig;