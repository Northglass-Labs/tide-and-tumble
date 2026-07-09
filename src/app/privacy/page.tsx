import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Tide & Tumble privacy policy. No accounts, no tracking, no analytics — a Northglass Labs product.",
  alternates: { canonical: "https://tideandtumble.app/privacy" },
};

const UPDATED = "July 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8 font-body text-ink">
      <nav className="font-body text-xs text-ink-soft">
        <Link href="/" className="text-ocean hover:underline">
          Tide &amp; Tumble
        </Link>{" "}
        › <span>Privacy</span>
      </nav>

      <h1 className="mt-2 font-display text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-ink-soft">Last updated: {UPDATED}</p>

      <div className="mt-5 space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="font-display text-base font-bold">Overview</h2>
          <p className="mt-1">
            Tide &amp; Tumble is a free tide-chart web app and a product of Northglass
            LLC. We built it to be genuinely private: there are no accounts, no
            cookies, no tracking scripts, and no analytics. This policy explains the
            little data the app touches and how it is handled. It sits under the
            company-wide{" "}
            <a
              href="https://northglass.io/privacy"
              className="text-ocean underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Northglass privacy policy
            </a>
            , which governs where this policy is silent.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">What we store</h2>
          <p className="mt-1">
            Nothing on a server, and no personal information. The app keeps a few
            preferences in your browser&apos;s <strong>localStorage</strong> only —
            your selected beach, recently viewed beaches, and your sound toggle —
            so the app remembers them on your next visit. This data never leaves
            your device and you can clear it any time by clearing your browser
            storage.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">Location</h2>
          <p className="mt-1">
            If you tap &quot;Near me&quot;, your browser asks your permission to
            share your location. If you allow it, your coordinates are used once, in
            that moment, to find the nearest tide station, and are not stored or
            logged. You can decline and pick a beach from the list instead — the app
            works fully without location access.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">Third-party data sources</h2>
          <p className="mt-1">
            Tide, weather, and map data come from free public services. Requests to
            them may include the beach coordinates you are viewing:
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-soft">
            <li>NOAA CO-OPS and NDBC — tide predictions and marine conditions</li>
            <li>National Weather Service — beach advisories and UV index</li>
            <li>OpenStreetMap — map tiles (only if you open the map picker)</li>
            <li>Zippopotam.us — turning a ZIP code into a location (only if you enter one)</li>
          </ul>
          <p className="mt-2">
            These are US government / open data services with their own terms. We
            proxy some of them through our own server routes purely to cache
            responses; those routes do not log who you are.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">Hosting</h2>
          <p className="mt-1">
            The app is hosted on Vercel, which may collect standard,
            non-personally-identifying request logs (such as IP address and
            user-agent) as part of operating the service, per Vercel&apos;s own
            privacy policy.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">Children</h2>
          <p className="mt-1">
            Tide &amp; Tumble is a general-audience app and does not knowingly
            collect any information from anyone, including children.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">Changes</h2>
          <p className="mt-1">
            If this policy changes we will update the date above. Material changes
            will be reflected here before they take effect.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold">Contact</h2>
          <p className="mt-1">
            Questions about your privacy? Email{" "}
            <a href="mailto:hello@northglass.io" className="text-ocean underline">
              hello@northglass.io
            </a>
            .
          </p>
        </section>

        <p className="pt-2 text-[11px] text-ink-soft/70">
          Tide predictions courtesy of NOAA CO-OPS. Not for navigation. Tide &amp;
          Tumble is a product of Northglass LLC.
        </p>
      </div>
    </main>
  );
}
