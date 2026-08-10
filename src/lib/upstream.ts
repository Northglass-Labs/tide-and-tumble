type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

export class UpstreamResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Upstream response exceeded ${maxBytes} bytes`);
    this.name = "UpstreamResponseTooLargeError";
  }
}

interface BoundedBody {
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
}

function combineSignals(
  first: AbortSignal | null | undefined,
  second: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!first) return { signal: second, cleanup: () => {} };
  if (first.aborted) return { signal: first, cleanup: () => {} };

  const controller = new AbortController();
  const abortFirst = () => controller.abort(first.reason);
  const abortSecond = () => controller.abort(second.reason);
  first.addEventListener("abort", abortFirst, { once: true });
  second.addEventListener("abort", abortSecond, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener("abort", abortFirst);
      second.removeEventListener("abort", abortSecond);
    },
  };
}

/** Fetch with a real abort signal so slow upstreams cannot hold a route indefinitely. */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: NextFetchInit = {},
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Upstream request timed out", "TimeoutError")),
    timeoutMs,
  );
  const combined = combineSignals(init.signal, controller.signal);

  try {
    return await fetch(input, {
      ...init,
      redirect: "error",
      signal: combined.signal,
    });
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
}

/** Read a response without ever buffering more than maxBytes. */
export async function readTextBounded(
  response: BoundedBody,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new UpstreamResponseTooLargeError(maxBytes);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UpstreamResponseTooLargeError(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBounded<T>(
  response: BoundedBody,
  maxBytes: number,
): Promise<T> {
  return JSON.parse(await readTextBounded(response, maxBytes)) as T;
}
