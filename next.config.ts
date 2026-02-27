import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: false,
};

export default nextConfig;
