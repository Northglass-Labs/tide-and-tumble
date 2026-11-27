import { afterEach, describe, expect, test, vi } from "vitest";
import {
  UpstreamResponseTooLargeError,
  fetchWithTimeout,
  readTextBounded,
} from "@/lib/upstream";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("upstream resource budgets", () => {
  test("rejects an oversized response before reading the body", async () => {
    const response = new Response("small", {
      headers: { "Content-Length": "1024" },
    });
    await expect(readTextBounded(response, 16)).rejects.toBeInstanceOf(
      UpstreamResponseTooLargeError,
    );
  });

  test("enforces the byte ceiling when content length is absent", async () => {
    const response = new Response("0123456789abcdef");
    await expect(readTextBounded(response, 8)).rejects.toBeInstanceOf(
      UpstreamResponseTooLargeError,
    );
  });

  test("aborts a slow upstream fetch at its deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }),
    );

    const pending = fetchWithTimeout("https://example.test/data", {}, 25);
    const rejection = expect(pending).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  test("never follows provider redirects at the shared fetch boundary", async () => {
    // "manual", not "error": the Workers runtime refuses "error". A 3xx comes
    // back as it is, not ok, and every caller treats it as a failure.
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithTimeout("https://example.test/data", {}, 100);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/data",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(response.ok).toBe(false);
  });
});
