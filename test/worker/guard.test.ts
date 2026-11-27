import { describe, expect, it } from "vitest";
import { stubUpstream, testApp } from "./helpers";

const WORKERS_DEV = "https://tide-and-tumble.example.workers.dev";

interface HealthBody {
  ok: boolean;
  version: { id: unknown; tag: unknown };
  time: string;
}

describe("GET /api/health", () => {
  it("says the API is up and which version is answering, and is never stored", async () => {
    const t = testApp();
    const response = await t.request("/api/health");

    expect(response.status).toBe(200);
    const body = await response.json<HealthBody>();
    expect(body.ok).toBe(true);
    expect(typeof body.version.id).toBe("string");
    expect(typeof body.version.tag).toBe("string");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers at the Worker's other addresses too, where the release checks ask it", async () => {
    const t = testApp();
    const response = await t.requestAt(WORKERS_DEV, "/api/health");
    expect(response.status).toBe(200);
  });

  it("answers HEAD without a body", async () => {
    const t = testApp();
    const response = await t.request("/api/health", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});

describe("the API's address and methods", () => {
  it("serves data only at the production address, and calls no upstream elsewhere", async () => {
    const upstream = stubUpstream([]);
    const t = testApp();
    for (const path of ["/api/tides?station=8651370", "/api/marine?station=8651370", "/api/alerts?station=8651370"]) {
      const response = await t.requestAt(WORKERS_DEV, path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found", message: "There is nothing at this address." });
    }
    expect(upstream.calls).toEqual([]);
  });

  it("answers only GET and HEAD, so nothing can be sent to it", async () => {
    const upstream = stubUpstream([]);
    const t = testApp();
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const response = await t.request("/api/tides?station=8651370", { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, HEAD");
      const body = await response.json<{ error: string }>();
      expect(body.error).toBe("method_not_allowed");
    }
    expect(upstream.calls).toEqual([]);
  });

  it("answers an unknown API path with the error shape", async () => {
    const t = testApp();
    const response = await t.request("/api/nearest?lat=35.9&lng=-75.6");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found", message: "There is nothing at this address." });
  });

  it("hands any other path that reaches the Worker to the static files", async () => {
    const t = testApp();
    const response = await t.request("/wp-login.php");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toMatch(/text\/html/);
  });
});

describe("headers on every API answer", () => {
  it("sends the security headers and no CORS permission", async () => {
    const t = testApp();
    for (const path of ["/api/health", "/api/nope", "/api/tides?station=bad"]) {
      const response = await t.request(path, { headers: { Origin: "https://elsewhere.example" } });
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=63072000");
      expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
});
