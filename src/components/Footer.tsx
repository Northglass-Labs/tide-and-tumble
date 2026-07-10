import Link from "next/link";

/** Site footer — Northglass identity, privacy, and contact on every page. */
export default function Footer() {
  return (
    <footer className="mx-auto w-full max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 lg:max-w-5xl lg:px-8">
      <div className="border-t border-ink/10 pt-4 text-center font-body text-[11px] leading-relaxed text-ink-soft/80">
        <p>
          <Link href="/" className="font-display font-semibold text-ocean-deep">
            Tide &amp; Tumble
          </Link>{" "}
          — a{" "}
          <a
            href="https://northglass.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ocean hover:underline"
          >
            Northglass Labs
          </a>{" "}
          product.
        </p>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <Link href="/privacy" className="text-ocean hover:underline">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <a href="mailto:hello@northglass.io" className="text-ocean hover:underline">
            Contact
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/Northglass-Labs/tide-and-tumble"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ocean hover:underline"
          >
            Source
          </a>
        </p>
        <p className="mt-1.5 text-ink-soft/60">
          Tide predictions courtesy of NOAA CO-OPS. Not for navigation. ©{" "}
          {new Date().getUTCFullYear()} Northglass LLC.
        </p>
      </div>
    </footer>
  );
}
