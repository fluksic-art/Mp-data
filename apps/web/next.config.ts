import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mpgenesis/shared", "@mpgenesis/database"],
};

export default nextConfig;
