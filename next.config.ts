import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  /* config options here */
  // Shown in the workspace sidebar. `bun run release` bumps package.json, so this follows each release.
  env: { APP_VERSION: pkg.version },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
