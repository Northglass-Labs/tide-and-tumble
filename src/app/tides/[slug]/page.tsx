import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TideApp from "@/components/TideApp";
import {
  BEACHES,
  beachBySlug,
  regionOf,
  nearbyBeaches,
  SITE_URL,
  type Beach,
} from "@/lib/slugs";
import {
  fetchBeachWeek,
  beachIntro,
  beachFaq,
  fmtFt,
  type BeachWeek,
} from "@/lib/seo";
import { fetchMarine, type Marine } from "@/lib/marine";
import { noaaId } from "@/lib/stations";
import { fmtClock, fmtDayLabel, stationNow, type Extremum } from "@/lib/tides";

// Re-generate each beach page hourly so "today" stays today.
export const revalidate = 3600;

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
  const description = `Live tide chart for ${beach.label}, ${beach.state}: today's high and low tide times with heights, a 7-day tide table, sunrise/sunset, moon phase, and surf conditions. NOAA predictions for ${beach.stationName}.`;
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

function TideCell({ events }: { events: Extremum[] }) {
  if (!events.length) return <td className="px-2 py-1.5 text-ink-soft">—</td>;
  return (
    <td className="px-2 py-1.5">
      {events.map((e) => (
        <span key={e.time} className="block whitespace-nowrap">
          {fmtClock(e.time)}{" "}
          <span className="text-ink-soft">({fmtFt(e.height)} ft)</span>
        </span>
      ))}
    </td>
  );
}

export default async function BeachTidePage({ params }: Props) {
  const { slug } = await params;
  const beach = beachBySlug(slug);
  if (!beach) notFound();

  const region = regionOf(beach);

  // NOAA/NDBC fetches: tolerate failure — the page must still render
  // (stale ISR copies keep serving; a fresh failure gets a friendly note).
  let week: BeachWeek | null = null;
  try {
    week = await fetchBeachWeek(beach);
  } catch {}
  let marine: Marine | null = null;
  try {
    marine = await fetchMarine({ noaaId: noaaId(beach), lat: beach.lat, lng: beach.lng });
  } catch {}

  const today = week?.days[0];
  const faq = beachFaq(beach, week);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(beach)) }}
      />

      {/* Page header + breadcrumb */}
      <header className="px-5 pt-5 pb-1">
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
          {fmtDayLabel(stationNow())} · live tide chart, 7-day tide table, sun
          &amp; moon, and surf conditions for {beach.label}.
        </p>
      </header>

      {/* The live, whimsical app — seeded to this beach */}
      <TideApp initialStation={beach} seeded />

      {/* 7-day tide table */}
      <section className="px-5 pt-2">
        <h2 className="font-display text-lg font-bold text-ink">
          {beach.label} tide table — next 7 days
        </h2>
        {week ? (
          <div className="mt-2 overflow-x-auto rounded-2xl bg-shell/70 shadow-[var(--shadow-card)]">
            <table className="w-full border-collapse font-body text-xs text-ink">
              <thead>
                <tr className="border-b border-ink/10 text-left font-display text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="px-2 py-2">Day</th>
                  <th className="px-2 py-2">High tides</th>
                  <th className="px-2 py-2">Low tides</th>
                  <th className="px-2 py-2">Sun</th>
                  <th className="px-2 py-2">Moon</th>
                </tr>
              </thead>
              <tbody>
                {week.days.map((d) => (
                  <tr key={d.dayStartMs} className="border-b border-ink/5 align-top">
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap">
                      {d.label}
                    </td>
                    <TideCell events={d.highs} />
                    <TideCell events={d.lows} />
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      ↑ {d.sunrise ?? "—"}
                      <span className="block">↓ {d.sunset ?? "—"}</span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {d.moonEmoji} {d.moonName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 rounded-2xl bg-coral-soft/40 p-3 font-body text-sm text-ink">
            The live tide table is temporarily unavailable — the interactive
            chart above has the latest NOAA predictions.
          </p>
        )}
        <p className="mt-1.5 font-body text-[11px] text-ink-soft/80">
          Times are local ({beach.label}). Heights in feet above MLLW. Source:
          NOAA CO-OPS, station {noaaId(beach)} ({beach.stationName}).
        </p>
      </section>

      {/* Marine snapshot */}
      {marine &&
        (marine.waterTempF != null || marine.windMph != null || marine.surfFt != null) && (
          <section className="px-5 pt-4">
            <h2 className="font-display text-lg font-bold text-ink">
              Current conditions
            </h2>
            <p className="mt-1 font-body text-sm text-ink">
              {marine.waterTempF != null && (
                <>Water {Math.round(marine.waterTempF)}°F. </>
              )}
              {marine.windMph != null && (
                <>
                  Wind {Math.round(marine.windMph)} mph
                  {marine.windDir ? ` ${marine.windDir}` : ""}.{" "}
                </>
              )}
              {marine.surfFt != null && (
                <>
                  Surf {marine.surfFt.toFixed(1)} ft
                  {marine.surfPeriodS != null
                    ? ` at ${Math.round(marine.surfPeriodS)}s`
                    : ""}
                  .
                </>
              )}
            </p>
            {marine.source && (
              <p className="mt-0.5 font-body text-[11px] text-ink-soft/80">
                Source: {marine.source}
              </p>
            )}
          </section>
        )}

      {/* Location intro */}
      <section className="px-5 pt-4">
        <h2 className="font-display text-lg font-bold text-ink">
          About tides at {beach.label}
        </h2>
        <p className="mt-1 font-body text-sm leading-relaxed text-ink">
          {beachIntro(beach, week)}
        </p>
      </section>

      {/* Nearby beaches — hub-and-spoke internal links */}
      <section className="px-5 pt-4">
        <h2 className="font-display text-lg font-bold text-ink">
          Tides near {beach.label}
        </h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 font-body text-sm">
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
      <section className="px-5 pt-5 pb-4">
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
        {today && (
          <p className="mt-4 font-body text-[11px] text-ink-soft/70">
            Updated {fmtDayLabel(week!.computedFor)} at {fmtClock(week!.computedFor)}{" "}
            local · Tide predictions courtesy of NOAA CO-OPS ·{" "}
            <strong>not for navigation</strong>.
          </p>
        )}
      </section>
    </main>
  );
}
