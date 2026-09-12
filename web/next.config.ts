import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Isolate automated browser/build runs from a developer's running dev server.
  distDir: process.env.NOTCH_NEXT_DIR || ".next",
};

export default nextConfig;
