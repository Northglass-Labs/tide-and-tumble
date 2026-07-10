import TideApp from "@/components/TideApp";
import Link from "next/link";
import { REGIONS, beachesInRegion } from "@/lib/slugs";

// The home page stays the full interactive app (localStorage + geolocation),
// with a server-rendered region/beach directory below it so crawlers (and
// people) can reach every beach page from `/`.
export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <TideApp />
      <nav
        aria-label="Tide charts by beach"
        className="mx-auto w-full max-w-md px-5 pb-10 pt-6 lg:max-w-5xl lg:px-8"
      >
        <h2 className="font-display text-sm font-semibold text-ink-soft">
          Tide charts by beach
        </h2>
        <div className="lg:grid lg:grid-cols-2 lg:gap-x-10">
          {REGIONS.map((r) => (
            <div key={r.slug} className="mt-3">
              <Link
                href={`/regions/${r.slug}`}
                className="font-display text-sm font-bold text-ocean-deep underline-offset-2 hover:underline"
              >
                {r.title} tide charts ›
              </Link>
              <p className="mt-1 font-body text-xs leading-relaxed text-ink-soft">
                {beachesInRegion(r).map((b, i) => (
                  <span key={b.slug}>
                    {i > 0 && " · "}
                    <Link
                      href={`/tides/${b.slug}`}
                      className="text-ocean underline-offset-2 hover:underline"
                    >
                      {b.label}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </nav>
    </main>
  );
}
