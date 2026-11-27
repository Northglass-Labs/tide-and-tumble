import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { PRIVATE_NO_STORE_HEADERS } from "../../lib/api-guard";

/**
 * Every API error has the same shape: a stable code for programs and one
 * plain sentence for people. Errors are never stored by a browser or a cache.
 */
export function fail(
  c: Context,
  status: ContentfulStatusCode,
  error: string,
  message: string,
  headers: Record<string, string> = {},
) {
  return c.json({ error, message }, status, { ...PRIVATE_NO_STORE_HEADERS, ...headers });
}

export const INVALID_STATION = "That is not a NOAA tide station this app knows.";

/**
 * Logs a failure as a fixed label and the error's class, never its message or
 * the request: messages can carry an upstream's text, and the privacy page
 * promises the API keeps no record of who asked.
 */
export function logFailure(event: string, error?: unknown): void {
  const detail = error instanceof Error ? error.name : undefined;
  console.error(JSON.stringify({ level: "error", event, ...(detail ? { detail } : {}) }));
}
