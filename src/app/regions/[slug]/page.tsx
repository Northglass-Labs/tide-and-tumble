import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  REGIONS,
  regionBySlug,
  beachesInRegion,
  SITE_URL,
  type Region,
} from "@/lib/slugs";

// Region hubs change only when the beach list changes — revalidate daily.
export const revalidate = 86400;

export function generateStaticParams() {
  return REGIONS.map((r) => ({ slug: r.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const region = regionBySlug(slug);
  if (!region) return {};
  const title = `${region.title} Tide Charts — High & Low Tide Times`;
  const description = `${region.blurb} Live tide charts and 7-day tide tables from NOAA for every beach.`;
  const url = `${SITE_URL}/regions/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Tide & Tumble", type: "website" },
  };
}

function breadcrumbJsonLd(region: Region) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tide & Tumble", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: `${region.title} Tide Charts`,
        item: `${SITE_URL}/regions/${region.slug}`,
      },
    ],
  };
}

const EXPOSURE_LABEL: Record<string, string> = {
  ocean: "🌊 ocean",
  inlet: "⛵ inlet",
  sound: "🦆 sound-side",
  bay: "🏞️ river/bay",
};

export default async function RegionPage({ params }: Props) {
  const { slug } = await params;
  const region = regionBySlug(slug);
  if (!region) notFound();

  const beaches = beachesInRegion(region);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col lg:max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(region)) }}
      />
      <header className="px-5 pt-5 lg:max-w-3xl lg:px-8">
        <nav aria-label="Breadcrumb" className="font-body text-xs text-ink-soft">
          <Link href="/" className="text-ocean hover:underline">
            Tide &amp; Tumble
          </Link>{" "}
          › <span>{region.title}</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-ink">
          {region.title} Tide Charts
        </h1>
        <p className="mt-2 font-body text-sm leading-relaxed text-ink-soft">
          {region.blurb}
        </p>
      </header>

      <section className="px-5 pt-4 pb-8 lg:px-8">
        <ul className="grid gap-2.5 lg:grid-cols-2 lg:gap-3">
          {beaches.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/tides/${b.slug}`}
                className="block rounded-2xl bg-shell/70 px-4 py-3 shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <span className="font-display text-base font-bold text-ocean-deep">
                  {b.label}, {b.state} tide chart
                </span>
                <span className="mt-0.5 block font-body text-xs text-ink-soft">
                  {EXPOSURE_LABEL[b.exposure] ?? b.exposure} · NOAA station{" "}
                  {b.stationName}
                  {b.note ? ` · ${b.note}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mt-6 font-display text-sm font-semibold text-ink-soft">
          Other regions
        </h2>
        <p className="mt-1 font-body text-sm">
          {REGIONS.filter((r) => r.slug !== region.slug).map((r, i) => (
            <span key={r.slug}>
              {i > 0 && " · "}
              <Link
                href={`/regions/${r.slug}`}
                className="text-ocean underline-offset-2 hover:underline"
              >
                {r.title}
              </Link>
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}
