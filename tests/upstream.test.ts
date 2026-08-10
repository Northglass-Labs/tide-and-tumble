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

  test("rejects provider redirects at the shared fetch boundary", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("https://example.test/data", {}, 100);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/data",
      expect.objectContaining({ redirect: "error" }),
    );
  });
});
