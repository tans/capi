import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge obscures the bottom-left corner during visual review.
  devIndicators: false,
  async rewrites() {
    return [
      // OpenAI clients conventionally append /v1 to the configured origin.
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};

export default nextConfig;
