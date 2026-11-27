import type { MetadataRoute } from "next";

// Written once at build time into the static export.
export const dynamic = "force-static";
import { SITE_URL } from "@/lib/slugs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
