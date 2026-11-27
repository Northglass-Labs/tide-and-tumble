import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  answeringVersion,
  checkHealth,
  FETCH_TIMEOUT_MS,
  networkDeps,
  NOT_A_PAGE,
  PAGE_MARKER,
  BUILT_PAGE,
  parseHealthArgs,
  TIDES_CHECK,
} from "../../scripts/lib/health-check.mjs";

const BASE = "https://tideandtumble.app";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=63072000",
};

interface FakeSite {
  health?: () => Response;
  page?: () => Response;
  missing?: () => Response;
  tides?: () => Response;
  /** How long each request takes, in order; the last value repeats. */
  durations?: number[];
}

/** A site that answers instantly, plus a clock that advances by a set amount per request. */
function fakeSite({ health, page, missing, tides, durations = [20] }: FakeSite = {}) {
  let now = 0;
  const requested: string[] = [];
  const headers: Record<string, Record<string, string>> = {};
  const tideTable = () =>
    Response.json({ station: { id: "8651370" }, extrema: [{ time: 1_800_000_000_000, height: 3.1, type: "H" }] });
  const healthy = () => Response.json({ ok: true, version: { id: "version-1", tag: "abc123def456" }, time: "t" });
  const root = () =>
    new Response(`<!doctype html><head>${PAGE_MARKER}</head>`, { status: 200, headers: SECURITY_HEADERS });
  const notFound = () => new Response("<h1>404</h1>", { status: 404 });

  return {
    requested,
    headers,
    deps: {
      fetch: (url: string, init?: { headers?: Record<string, string> }) => {
        requested.push(url);
        headers[url] = init?.headers ?? {};
        now += durations[Math.min(requested.length - 1, durations.length - 1)] ?? 0;
        const answer = url.endsWith("/api/health")
          ? (health ?? healthy)
          : url.endsWith(NOT_A_PAGE)
            ? (missing ?? notFound)
            : url.endsWith(TIDES_CHECK)
              ? (tides ?? tideTable)
              : (page ?? root);
        return Promise.resolve(answer());
      },
      now: () => now,
      sleep: (ms: number) => {
        now += ms;
        return Promise.resolve();
      },
    },
  };
}

const defaults = {
  baseUrl: BASE,
  expectTag: null,
  expectVersion: null,
  samples: 20,
  p95Ms: 300,
  waitMs: 0,
  builtWithinDays: null,
};

describe("parseHealthArgs()", () => {
  it("needs only the address and has the plan's defaults", () => {
    expect(parseHealthArgs([BASE])).toEqual(defaults);
  });

  it("reads every option", () => {
    const args = [BASE, "--expect-tag", "abc123def456", "--samples", "5", "--p95-ms", "150", "--wait-ms", "9000"];

    expect(parseHealthArgs(args)).toEqual({
      baseUrl: BASE,
      expectTag: "abc123def456",
      expectVersion: null,
      samples: 5,
      p95Ms: 150,
      waitMs: 9000,
      builtWithinDays: null,
    });
  });

  it("drops a trailing slash from the address", () => {
    expect(parseHealthArgs([`${BASE}/`]).baseUrl).toBe(BASE);
  });

  it("refuses a missing address, an unknown option and a number that is not one", () => {
    expect(() => parseHealthArgs([])).toThrow("Usage");
    expect(() => parseHealthArgs(["not a url"])).toThrow("Usage");
    expect(() => parseHealthArgs([BASE, "--nope"])).toThrow("--nope");
    expect(() => parseHealthArgs([BASE, "--samples", "many"])).toThrow("--samples");
    expect(() => parseHealthArgs([BASE, "--samples", "0"])).toThrow("--samples");
    expect(() => parseHealthArgs([BASE, "--expect-tag"])).toThrow("--expect-tag");
  });
});

describe("checkHealth()", () => {
  it("passes a healthy site and reports what it measured", async () => {
    const site = fakeSite();

    const result = await checkHealth({ ...defaults, expectTag: "abc123def456" }, site.deps);

    expect(result).toEqual({
      ok: true,
      blocked: false,
      url: BASE,
      tag: "abc123def456",
      versionId: "version-1",
      samples: 20,
      p95Ms: 20,
      limitMs: 300,
      failures: [],
    });
    // One check of the API, one of the page, one of an unknown path, one of the data API, then the timed samples.
    expect(site.requested).toHaveLength(24);
    expect(site.requested[1]).toBe(`${BASE}/`);
    expect(site.requested[2]).toBe(`${BASE}${NOT_A_PAGE}`);
    expect(site.requested[3]).toBe(`${BASE}${TIDES_CHECK}`);
  });

  describe("the data API", () => {
    const json = (status: number, body: unknown) => () => Response.json(body, { status });
    const failuresFor = async (tides: () => Response, baseUrl = BASE) =>
      (await checkHealth({ ...defaults, baseUrl, samples: 1 }, fakeSite({ tides }).deps)).failures;

    it("asks for a known station's tides, as the site's own pages ask", async () => {
      const site = fakeSite();
      await checkHealth({ ...defaults, samples: 1 }, site.deps);
      expect(TIDES_CHECK).toBe("/api/tides?station=8651370");
      // A zone rule may refuse /api/ requests that are not the site's own (docs/DELIVERY.md).
      expect(site.headers[`${BASE}${TIDES_CHECK}`]).toMatchObject({ "Sec-Fetch-Site": "same-origin" });
    });

    it("passes a tide table, and NOAA's outage passed on as upstream_unavailable", async () => {
      expect(await failuresFor(json(502, { error: "upstream_unavailable", message: "NOAA is down." }))).toEqual([]);
    });

    it("fails anything else: an error, an empty table, another 502, or an answer that is not JSON", async () => {
      for (const tides of [
        json(500, { error: "internal", message: "Something went wrong." }),
        json(404, { error: "not_found", message: "No such route." }),
        json(429, { error: "rate_limited", message: "Too many requests." }),
        json(502, { error: "no_predictions", message: "No predictions." }),
        json(200, { station: { id: "8651370" }, extrema: [] }),
        () => new Response("<h1>Bad gateway</h1>", { status: 502 }),
      ]) {
        const failures = await failuresFor(tides);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain(TIDES_CHECK);
      }
    });

    it("expects the data routes' 404 at the workers.dev address, where they never answer", async () => {
      const dev = "https://tide-and-tumble.example.workers.dev";
      expect(await failuresFor(json(404, { error: "not_found", message: "No such route." }), dev)).toEqual([]);
      const answered = await failuresFor(() => Response.json({ extrema: [{}] }), dev);
      expect(answered).toHaveLength(1);
      expect(answered[0]).toContain("off the production address");
    });
  });

  it("fails when the API does not answer 200", async () => {
    const site = fakeSite({ health: () => Response.json({ error: "x", message: "y" }, { status: 503 }) });

    const result = await checkHealth(defaults, site.deps);

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain("/api/health answered 503");
  });

  it("says a check Cloudflare's bot protection challenged was blocked, not unhealthy, and stops at once", async () => {
    // Bot protection answers a client it takes for a bot with a challenge page instead of the site.
    const challenge = () =>
      new Response("<!doctype html><title>Just a moment...</title>", {
        status: 403,
        headers: { "Content-Type": "text/html", "cf-mitigated": "challenge" },
      });
    const site = fakeSite({ health: challenge, page: challenge });

    const result = await checkHealth({ ...defaults, waitMs: 90_000 }, site.deps);

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.failures).toEqual([expect.stringContaining("blocked")]);
    // Waiting does not lift a challenge, and there is nothing to time.
    expect(site.requested).toEqual([`${BASE}/api/health`]);
  });

  it("takes a 403 without Cloudflare's challenge marker for an answer: unhealthy, not blocked", async () => {
    const site = fakeSite({ health: () => Response.json({ error: "forbidden", message: "No." }, { status: 403 }) });

    const result = await checkHealth(defaults, site.deps);

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.failures[0]).toContain("/api/health answered 403");
  });

  it("says so when only the page was challenged", async () => {
    const site = fakeSite({
      page: () => new Response("challenge", { status: 403, headers: { "cf-mitigated": "challenge" } }),
    });

    const result = await checkHealth(defaults, site.deps);

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.failures).toEqual([expect.stringContaining("blocked")]);
  });

  it("fails when the API says it is not ok", async () => {
    const site = fakeSite({
      health: () => Response.json({ ok: false, version: { id: "v", tag: "t" }, time: "t" }),
    });

    const result = await checkHealth(defaults, site.deps);

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("ok: false");
  });

  it("fails when another version is answering than the one expected", async () => {
    const site = fakeSite();

    const result = await checkHealth({ ...defaults, expectTag: "ffffffffffff" }, site.deps);

    expect(result.ok).toBe(false);
    expect(result.tag).toBe("abc123def456");
    expect(result.failures[0]).toContain('expected tag "ffffffffffff"');
  });

  it("waits for the expected version to take over, up to the limit it is given", async () => {
    let calls = 0;
    const site = fakeSite({
      health: () => {
        calls += 1;
        const tag = calls < 4 ? "000000000000" : "abc123def456";
        return Response.json({ ok: true, version: { id: "version-1", tag }, time: "t" });
      },
    });

    const result = await checkHealth({ ...defaults, expectTag: "abc123def456", waitMs: 30_000 }, site.deps);

    expect(result.ok).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(4);
  });

  it("gives up waiting when the limit passes", async () => {
    const site = fakeSite();

    const result = await checkHealth({ ...defaults, expectTag: "ffffffffffff", waitMs: 5_000 }, site.deps);

    expect(result.ok).toBe(false);
    // It kept trying for the whole wait, not just once.
    expect(site.requested.length).toBeGreaterThan(2);
  });

  it("can expect a version id instead of a tag", async () => {
    const site = fakeSite();

    const right = await checkHealth({ ...defaults, expectVersion: "version-1" }, site.deps);
    const wrong = await checkHealth({ ...defaults, expectVersion: "version-2" }, fakeSite().deps);

    expect(right.ok).toBe(true);
    expect(wrong.ok).toBe(false);
    expect(wrong.failures[0]).toContain('expected version "version-2"');
  });

  it("fails when the page is missing or is not the app", async () => {
    const missing = await checkHealth(defaults, fakeSite({ page: () => new Response("no", { status: 404 }) }).deps);
    const wrongPage = await checkHealth(
      defaults,
      fakeSite({ page: () => new Response("<h1>Hello</h1>", { headers: SECURITY_HEADERS }) }).deps,
    );

    expect(missing.ok).toBe(false);
    expect(missing.failures[0]).toContain("/ answered 404");
    expect(wrongPage.ok).toBe(false);
    expect(wrongPage.failures[0]).toContain("not this app's page");
  });

  it("fails when the page comes without its security headers, as when _headers was not uploaded", async () => {
    const bare = () => new Response(`<head>${PAGE_MARKER}</head>`, { status: 200 });

    const result = await checkHealth(defaults, fakeSite({ page: bare }).deps);

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      "/ was served without its Content-Security-Policy (public/_headers)",
      "/ was served without Strict-Transport-Security",
    ]);
  });

  it("fails when an unknown path is not a 404, as with a fallback to the home page", async () => {
    const fallback = () => new Response(`<head>${PAGE_MARKER}</head>`, { status: 200 });

    const result = await checkHealth(defaults, fakeSite({ missing: fallback }).deps);

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([`${NOT_A_PAGE} answered 200, not 404`]);
  });

  it("fails when the 95th percentile is at or over the limit", async () => {
    // The four checks, then 20 samples of which two are slow.
    const durations = [10, 10, 10, 10, ...Array.from({ length: 18 }, () => 40), 450, 500];

    const slow = await checkHealth(defaults, fakeSite({ durations }).deps);
    const atLimit = await checkHealth({ ...defaults, p95Ms: 40 }, fakeSite({ durations: [40] }).deps);

    expect(slow.ok).toBe(false);
    expect(slow.p95Ms).toBe(450);
    expect(slow.failures[0]).toContain("p95 450 ms");
    expect(atLimit.ok).toBe(false);
  });

  it("does not time samples when the first check already failed", async () => {
    const site = fakeSite({ health: () => new Response("down", { status: 500 }) });

    const result = await checkHealth(defaults, site.deps);

    expect(result.p95Ms).toBeNull();
    expect(site.requested.length).toBeLessThan(5);
  });

  it("reports an unreachable site as a failure, not a crash", async () => {
    const result = await checkHealth(defaults, {
      fetch: () => Promise.reject(new TypeError("fetch failed")),
      now: () => 0,
      sleep: () => Promise.resolve(),
    });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain("fetch failed");
  });
});

describe("answeringVersion()", () => {
  const deps = (respond: () => Response | Promise<Response>) => ({
    fetch: () => Promise.resolve(respond()),
    now: () => 0,
    sleep: () => Promise.resolve(),
  });

  it("is the version id the site reports, healthy or not", async () => {
    // /api/health names the version whatever its status.
    const id = "77777777-7777-4777-8777-777777777777";
    for (const status of [200, 503]) {
      const body = { ok: status === 200, db: status === 200 ? "ok" : "error", version: { id, tag: "t" } };
      const answer = await answeringVersion(BASE, deps(() => Response.json(body, { status })));
      expect(answer).toEqual({ versionId: id, detail: `/api/health answered ${status}` });
    }
  });

  it("takes only a Cloudflare version id, never text that Wrangler would read as a flag", async () => {
    // The id goes on Wrangler's command line: "--help" there would answer, and confirm, nothing at all.
    for (const id of ["--help", "--config=/tmp/elsewhere.json", "version-7", "77777777-7777-4777-8777-77777777777", ""]) {
      const body = { ok: true, db: "ok", version: { id, tag: "t" } };
      const answer = await answeringVersion(BASE, deps(() => Response.json(body)));
      expect(answer.versionId).toBeNull();
    }
    const flag = await answeringVersion(BASE, deps(() => Response.json({ ok: true, version: { id: "--help" } })));
    expect(flag.detail).toBe("/api/health answered 200 with a version id that is not a Cloudflare version id");
  });

  it("is null, with the reason, when the site cannot say", async () => {
    const cases: [() => Response | Promise<Response>, string][] = [
      [() => new Response("challenge", { status: 403, headers: { "cf-mitigated": "challenge" } }), "blocked"],
      [() => new Response("<html>error code: 1101</html>", { status: 500 }), "no version"],
      [() => Response.json({ error: "internal_error", message: "x" }, { status: 500 }), "no version"],
      [() => Promise.reject(new Error("getaddrinfo ENOTFOUND")), "could not be reached"],
    ];
    for (const [respond, reason] of cases) {
      const answer = await answeringVersion(BASE, deps(respond));
      expect(answer.versionId).toBeNull();
      expect(answer.detail).toContain(reason);
    }
  });
});

describe("the network the checks use", () => {
  let server: Server | null = null;
  const sockets: Socket[] = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.destroy();
    server?.close();
    server = null;
  });

  /** An address that accepts connections and never answers, like a stalled origin. */
  async function stalled(): Promise<string> {
    server = createServer((socket) => void sockets.push(socket));
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    return `http://127.0.0.1:${address.port}`;
  }

  it("gives up on a request that gets no answer, so a stalled address cannot hold a release", async () => {
    expect(FETCH_TIMEOUT_MS).toBe(10_000);
    const base = await stalled();
    const started = performance.now();

    const answer = await answeringVersion(base, networkDeps(200));

    expect(performance.now() - started).toBeLessThan(5_000);
    expect(answer.versionId).toBeNull();
    expect(answer.detail).toMatch(/^\/api\/health could not be reached/);
  });

  it("ends a health check of a stalled address by its deadline", async () => {
    const base = await stalled();
    const started = performance.now();

    const result = await checkHealth(
      { baseUrl: base, expectTag: null, expectVersion: null, samples: 3, p95Ms: 300, waitMs: 500 },
      networkDeps(200),
    );

    expect(performance.now() - started).toBeLessThan(10_000);
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(false);
  });
});

describe("what the checks ask for", () => {
  it("is only pages, GET /api/health and one GET of the data API, whose 404 the workers.dev address answers", async () => {
    // The first release and a release while production cannot answer are checked at workers.dev, where the
    // Worker answers nothing else under /api: there the data API's request expects that 404.
    const asked: string[] = [];
    const deps = {
      fetch: (url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
        return Promise.resolve(
          new URL(url).pathname === "/"
            ? new Response(`<head>${PAGE_MARKER}</head>`, { status: 200, headers: SECURITY_HEADERS })
            : new URL(url).pathname === NOT_A_PAGE
              ? new Response("", { status: 404 })
              : Response.json({ ok: true, version: { id: "77777777-7777-4777-8777-777777777777", tag: "t" } }),
        );
      },
      now: () => 0,
      sleep: () => Promise.resolve(),
    };

    await checkHealth({ baseUrl: BASE, expectTag: "t", expectVersion: null, samples: 3, p95Ms: 300, waitMs: 0 }, deps);
    await answeringVersion(BASE, deps);

    expect(new Set(asked)).toEqual(new Set(["GET /", `GET ${NOT_A_PAGE}`, "GET /api/health", "GET /api/tides"]));
  });
});

describe("the beach pages' build date (the daily check)", () => {
  const today = Date.UTC(2026, 10, 27, 11, 41);
  const page = (built: string | null) => () =>
    new Response(
      `<!doctype html><head>${PAGE_MARKER}${built ? `<meta name="tide-table-built" content="${built}"/>` : ""}</head>`,
      { status: 200, headers: SECURITY_HEADERS },
    );
  const check = async (built: string | null) => {
    const site = fakeSite({ page: page(built) });
    const result = await checkHealth(
      { ...defaults, samples: 1, builtWithinDays: 2 },
      { ...site.deps, date: () => today },
    );
    return { result, site };
  };

  it("reads --built-within-days", () => {
    expect(parseHealthArgs([BASE, "--built-within-days", "2"]).builtWithinDays).toBe(2);
  });

  it("passes pages built within the days given: the nightly refresh is releasing", async () => {
    for (const built of ["2026-11-27", "2026-11-25"]) {
      const { result, site } = await check(built);
      expect(result.failures).toEqual([]);
      expect(site.requested).toContain(`${BASE}${BUILT_PAGE}`);
    }
  });

  it("fails pages built longer ago, or with no build date: the nightly refresh has stopped releasing", async () => {
    expect((await check("2026-11-24")).result.failures).toEqual([
      `${BUILT_PAGE} was built on 2026-11-24, more than 2 days ago: the nightly refresh has not released since`,
    ]);
    expect((await check(null)).result.failures).toEqual([`${BUILT_PAGE} carries no build date (tide-table-built)`]);
  });

  it("asks for no beach page unless told to", async () => {
    const site = fakeSite();
    await checkHealth({ ...defaults, samples: 1 }, site.deps);
    expect(site.requested).not.toContain(`${BASE}${BUILT_PAGE}`);
  });
});

