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

/**
 * Fetch with a real abort signal so slow upstreams cannot hold a route
 * indefinitely. Redirects are never followed: `manual` hands back the 3xx
 * itself, which is not `ok`, so every caller treats it as a failure. (The
 * Workers runtime refuses `redirect: "error"`.)
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
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
      redirect: "manual",
      signal: combined.signal,
    });
  } finally {
    clearTimeout(timeout);
    combined.cleanup();
  }
}

/**
 * The data lines (neither blank nor "#" headers) at the start of a text body,
 * read only while `wanted` accepts them: the first line it refuses ends the
 * read, and the rest of the body is cancelled. At most `maxBytes` are read;
 * what was read by then is returned.
 */
export async function readDataLines(
  response: BoundedBody,
  maxBytes: number,
  wanted: (line: string) => boolean,
): Promise<string[]> {
  if (!response.body) return [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lines: string[] = [];
  let total = 0;
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (!done) {
        total += value.byteLength;
        pending += decoder.decode(value, { stream: true });
      }
      const parts = pending.split("\n");
      pending = done ? "" : (parts.pop() ?? "");
      for (const line of parts) {
        if (line.trim() === "" || line.startsWith("#")) continue;
        if (!wanted(line)) {
          if (!done) await reader.cancel();
          return lines;
        }
        lines.push(line);
      }
      if (done) return lines;
      if (total > maxBytes) {
        await reader.cancel();
        return lines;
      }
    }
  } finally {
    reader.releaseLock();
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
