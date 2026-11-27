import type { NextConfig } from "next";

// The site is a static export (out/): Cloudflare serves the files, and the
// one Worker under /api answers everything live (src/worker, wrangler.jsonc).
// Nothing here may need a server at request time; `next build` refuses it.
const nextConfig: NextConfig = {
  output: "export",
  // URLs stay as they were: /tides/nags-head, served from tides/nags-head.html.
  trailingSlash: false,
  // No next/image in the app; a static export cannot optimise images anyway.
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
