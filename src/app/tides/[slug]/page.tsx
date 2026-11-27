import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BeachTideTable from "@/components/BeachTideTable";
import TideApp from "@/components/TideApp";
import TodayLabel from "@/components/TodayLabel";
import {
  BEACHES,
  beachBySlug,
  regionOf,
  nearbyBeaches,
  SITE_URL,
  type Beach,
} from "@/lib/slugs";
import { fetchBeachWeek, beachIntro, beachFaq, type BeachWeek } from "@/lib/seo";
import { noaaId } from "@/lib/stations";
import { fmtDayLabel, stationNow } from "@/lib/tides";

// Every beach page is a static file, built with the site (and again nightly):
// no page outside the list, and nothing live baked in. Conditions and NWS
// safety data are fetched by the page itself; the tide table is rebuilt in the
// browser for today (docs/specs/2026-11-27-workers-hosting.md).
export const dynamicParams = false;

export function generateStaticParams() {
  return BEACHES.map((b) => ({ slug: b.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const beach = beachBySlug(slug);
  if (!beach) return {};
  const title = `${beach.label}, ${beach.state} Tide Chart — Today's High & Low Tide Times`;
  const description = `Live tide chart for ${beach.label}, ${beach.state}: today's high and low tide times with heights, a 30-day tide forecast table, sunrise/sunset, moon phase, and surf conditions. NOAA predictions for ${beach.stationName}.`;
  const url = `${SITE_URL}/tides/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Tide & Tumble",
      type: "website",
    },
    // The day this page was built (UTC). The daily check reads it to see that
    // the nightly refresh is still releasing (npm run health --built-within-days).
    other: { "tide-table-built": new Date().toISOString().slice(0, 10) },
  };
}

function breadcrumbJsonLd(beach: Beach) {
  const region = regionOf(beach);
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
      {
        "@type": "ListItem",
        position: 3,
        name: `${beach.label}, ${beach.state} Tide Chart`,
        item: `${SITE_URL}/tides/${beach.slug}`,
      },
    ],
  };
}

export default async function BeachTidePage({ params }: Props) {
  const { slug } = await params;
  const beach = beachBySlug(slug);
  if (!beach) notFound();

  const region = regionOf(beach);

  // NOAA fetch at build time: tolerate failure — the page must still build,
  // and the browser fills the table in from the live chart's predictions.
  let week: BeachWeek | null = null;
  try {
    week = await fetchBeachWeek(beach, 30);
  } catch {}

  const faq = beachFaq(beach, week);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col lg:max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(beach)) }}
      />

      {/* Page header + breadcrumb */}
      <header className="px-5 pt-5 pb-1 lg:max-w-3xl lg:px-8">
        <nav aria-label="Breadcrumb" className="font-body text-xs text-ink-soft">
          <Link href="/" className="text-ocean hover:underline">
            Tide &amp; Tumble
          </Link>{" "}
          ›{" "}
          <Link href={`/regions/${region.slug}`} className="text-ocean hover:underline">
            {region.title}
          </Link>{" "}
          › <span>{beach.label}</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-ink">
          Tides Today &amp; Tomorrow in {beach.label}, {beach.state}
        </h1>
        <p className="mt-1 font-body text-sm text-ink-soft">
          <TodayLabel built={fmtDayLabel(stationNow())} /> · live tide chart, 7-day tide table, sun
          &amp; moon, and surf conditions for {beach.label}.
        </p>
      </header>

      {/* The live, whimsical app — seeded to this beach. Safety alerts render
          INSIDE TideApp only, fetched live; a static page never carries them. */}
      <TideApp initialStation={beach} seeded />

      {/* Tide table: 7 days visible + the rest of the 30-day forecast behind a
          native disclosure (server-rendered either way, so crawlers see it all) */}
      <section className="px-5 pt-2 lg:max-w-3xl lg:px-8">
        <h2 className="font-display text-lg font-bold text-ink">
          {beach.label} tide table — next 7 days
        </h2>
        <BeachTideTable beach={beach} initialWeek={week} days={30} />
        <p className="mt-1.5 font-body text-[11px] text-ink-soft/80">
          Times are local ({beach.label}). Heights in feet above MLLW. Source:
          NOAA CO-OPS, station {noaaId(beach)} ({beach.stationName}).
        </p>
      </section>

      {/* Where the live numbers come from. They are fetched by the app above,
          never baked into this static page: a stale reading would mislead. */}
      <section className="px-5 pt-4 lg:max-w-3xl lg:px-8">
        <h2 className="font-display text-lg font-bold text-ink">
          Live conditions at {beach.label}
        </h2>
        <p className="mt-1 font-body text-sm leading-relaxed text-ink">
          Water temperature, wind and surf in the chart above come from the
          nearest NOAA NDBC buoys and NOAA&apos;s gauge at {beach.stationName}. The
          day&apos;s rip current risk and UV index come from the National Weather
          Service, checked each time the page loads.
        </p>
      </section>

      {/* Location intro */}
      <section className="px-5 pt-4 lg:max-w-3xl lg:px-8">
        <h2 className="font-display text-lg font-bold text-ink">
          About tides at {beach.label}
        </h2>
        <p className="mt-1 font-body text-sm leading-relaxed text-ink">
          {beachIntro(beach, week)}
        </p>
      </section>

      {/* Nearby beaches — hub-and-spoke internal links */}
      <section className="px-5 pt-4 lg:max-w-3xl lg:px-8">
        <h2 className="font-display text-lg font-bold text-ink">
          Tides near {beach.label}
        </h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 font-body text-sm sm:grid-cols-3">
          {nearbyBeaches(beach).map(({ beach: b, miles }) => (
            <li key={b.slug}>
              <Link
                href={`/tides/${b.slug}`}
                className="block rounded-2xl bg-shell/70 px-3 py-2 shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <span className="font-semibold text-ocean-deep">{b.label}</span>
                <span className="block text-[11px] text-ink-soft">
                  {Math.round(miles)} mi · {b.state}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ (content only — no FAQPage schema; rich results retired May 2026) */}
      <section className="px-5 pt-5 pb-4 lg:max-w-3xl lg:px-8">
        <h2 className="font-display text-lg font-bold text-ink">
          {beach.label} tide FAQ
        </h2>
        <dl className="mt-2 space-y-3">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="font-display text-sm font-semibold text-ink">{f.q}</dt>
              <dd className="mt-0.5 font-body text-sm leading-relaxed text-ink-soft">
                {f.a}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 font-body text-[11px] text-ink-soft/70">
          Tide predictions courtesy of NOAA CO-OPS ·{" "}
          <strong>not for navigation</strong>.
        </p>
      </section>
    </main>
  );
}
