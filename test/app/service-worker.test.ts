import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, test, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

function requestKey(input: Request | string): string {
  return typeof input === "string" ? input : input.url;
}

function createHarness() {
  const listeners = new Map<string, Listener>();
  const entries = new Map<string, Response>();
  const cache = {
    delete: vi.fn(async (request: Request | string) => entries.delete(requestKey(request))),
    match: vi.fn(async (request: Request | string) => {
      const response = entries.get(requestKey(request));
      return response?.clone();
    }),
    put: vi.fn(async (request: Request | string, response: Response) => {
      entries.set(requestKey(request), response.clone());
    }),
  };
  const caches = {
    delete: vi.fn(async () => true),
    keys: vi.fn(async () => ["tnt-v1", "other-app-cache"]),
    match: vi.fn(cache.match),
    open: vi.fn(async () => cache),
  };
  const fetchMock = vi.fn<(input: Request | string) => Promise<Response>>();
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: { claim: vi.fn(async () => undefined) },
    location: { origin: "https://tide.test" },
    skipWaiting: vi.fn(),
  };

  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    Date,
    Headers,
    Promise,
    Request,
    Response,
    URL,
    caches,
    fetch: fetchMock,
    self,
  });

  async function dispatchFetch(url: string): Promise<Response> {
    let responsePromise: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      request: new Request(url),
      respondWith: (response: Promise<Response> | Response) => {
        responsePromise = Promise.resolve(response);
      },
    });
    if (!responsePromise) throw new Error("service worker did not handle request");
    const response = await responsePromise;
    await Promise.resolve();
    return response;
  }

  async function dispatchActivate(): Promise<void> {
    let work: Promise<unknown> | undefined;
    listeners.get("activate")?.({
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
  }

  return { cache, caches, dispatchActivate, dispatchFetch, entries, fetchMock };
}

afterEach(() => vi.restoreAllMocks());

describe("shipped service-worker privacy and freshness policy", () => {
  test.each([
    "/api/nearest?lat=35.123456&lng=-75.987654",
    "/api/alerts?lat=35.1234&lng=-75.9877",
    "/api/marine?station=8651370&lat=35.1234&lng=-75.9877",
  ])("never persists location or safety response %s", async (path) => {
    const h = createHarness();
    h.fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await h.dispatchFetch("https://tide.test" + path);

    expect(h.cache.put).not.toHaveBeenCalled();
  });

  test("normalizes the offline tide cache key and records cache time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_750_000_000_000);
    const h = createHarness();
    h.fetchMock.mockResolvedValue(
      Response.json({ extrema: [] }, { headers: { "Cache-Control": "public" } }),
    );

    await h.dispatchFetch(
      "https://tide.test/api/tides?station=8651370&lat=35.1234&lng=-75.9877",
    );

    expect(h.cache.put).toHaveBeenCalledTimes(1);
    const [key, cached] = h.cache.put.mock.calls[0] as [Request, Response];
    expect(key.url).toBe("https://tide.test/api/tides?station=8651370");
    expect(cached.headers.get("X-Tide-Cached-At")).toBe("1750000000000");
  });

  test("marks a bounded offline tide fallback and refuses an expired one", async () => {
    const now = 1_750_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const h = createHarness();
    const key = "https://tide.test/api/tides?station=8651370";
    h.entries.set(
      key,
      Response.json(
        { extrema: [] },
        { headers: { "X-Tide-Cached-At": String(now - 60_000) } },
      ),
    );
    h.fetchMock.mockRejectedValue(new TypeError("offline"));

    const fresh = await h.dispatchFetch(key);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("X-Tide-Offline")).toBe("1");
    expect(fresh.headers.get("X-Tide-Cached-At")).toBe(String(now - 60_000));

    h.entries.set(
      key,
      Response.json(
        { extrema: [] },
        { headers: { "X-Tide-Cached-At": String(now - 7 * 60 * 60 * 1000) } },
      ),
    );
    const expired = await h.dispatchFetch(key);
    expect(expired.status).toBe(503);
    expect(h.cache.delete).toHaveBeenCalled();
  });

  test("activation removes only obsolete Tide caches", async () => {
    const h = createHarness();
    await h.dispatchActivate();

    expect(h.caches.delete).toHaveBeenCalledWith("tnt-v1");
    expect(h.caches.delete).not.toHaveBeenCalledWith("other-app-cache");
  });
});
