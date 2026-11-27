import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { createApp } from "../../src/worker/index";

/** The address the tests' Worker treats as production (vitest.config.mts sets APP_ORIGIN). */
export const ORIGIN = "https://tide.test";

/** 10:00 in New York on 2026-11-27, inside the fixtures' prediction window. */
export const START = Date.UTC(2026, 10, 27, 15, 0, 0);

/** A client address from the documentation range (RFC 5737). */
export const CLIENT = "198.51.100.7";

/**
 * The real app with two test doubles: a clock that moves only when a test
 * moves it (`t.clock.now += ms`), and a cache of its own, so tests never see
 * each other's entries.
 */
export function testApp() {
  const clock = { now: START };
  const cacheName = `test-${crypto.randomUUID()}`;
  const contexts: ExecutionContext[] = [];
  const app = createApp({ now: () => clock.now, cache: () => caches.open(cacheName) });

  const send = (origin: string, path: string, init: RequestInit = {}, client = CLIENT) => {
    const context = createExecutionContext();
    contexts.push(context);
    const headers = new Headers(init.headers);
    if (!headers.has("CF-Connecting-IP")) headers.set("CF-Connecting-IP", client);
    return app.request(`${origin}${path}`, { ...init, headers }, env, context);
  };

  return {
    clock,
    /** A request to the production address, from one client. */
    request: (path: string, init?: RequestInit, client?: string) => send(ORIGIN, path, init, client),
    /** A request to the same Worker at another address, such as its workers.dev one. */
    requestAt: (origin: string, path: string, init?: RequestInit) => send(origin, path, init),
    /** Waits for the work the app left running after it answered (`waitUntil`). */
    settle: async () => {
      for (const context of contexts.splice(0)) {
        await waitOnExecutionContext(context);
      }
    },
  };
}

export type TestApp = ReturnType<typeof testApp>;

type Answer = (url: URL) => Response | Promise<Response>;

/**
 * Stands in for NOAA, NDBC and NWS: each call is answered by the first route
 * whose prefix (or pattern) matches its URL, and recorded. A call no route
 * matches fails, so a test notices an upstream it did not expect.
 */
export function stubUpstream(routes: [match: string | RegExp, answer: Answer][]) {
  const calls: { url: URL; headers: Headers }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    calls.push({ url, headers: new Headers(init?.headers ?? request?.headers) });
    for (const [match, answer] of routes) {
      const text = url.toString();
      if (typeof match === "string" ? text.startsWith(match) : match.test(text)) {
        return answer(url);
      }
    }
    throw new TypeError(`unexpected upstream request: ${url.toString()}`);
  });
  return { calls, spy };
}

export const NOAA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
export const NDBC = "https://www.ndbc.noaa.gov/data/realtime2/";
export const NWS = "https://api.weather.gov/";

export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
  });

export const text = (body: string, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { "Content-Type": "text/plain" } });
