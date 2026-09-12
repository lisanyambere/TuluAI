import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tulu/shared"],
  async rewrites() {
    return [
      {
        source: "/agent-api/:path*",
        destination: `${process.env.AGENT_API_URL ?? "http://127.0.0.1:8787"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
