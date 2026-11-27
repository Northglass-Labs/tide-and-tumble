import type { MetadataRoute } from "next";

// Written once at build time into the static export.
export const dynamic = "force-static";
import { BEACHES, REGIONS, SITE_URL } from "@/lib/slugs";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    ...REGIONS.map((r) => ({
      url: `${SITE_URL}/regions/${r.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...BEACHES.map((b) => ({
      url: `${SITE_URL}/tides/${b.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
