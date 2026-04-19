import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mpgenesis/shared", "@mpgenesis/database"],
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
