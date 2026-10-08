export interface JsonResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

/** Long enough for receipts, whose PDF is rendered before the response. */
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * fetch with a JSON body that never mistakes a server error for a network error: a non-JSON
 * error page (a 500 from Express, a 502/504 from a reverse proxy) still comes back as
 * `{ ok: false, status }`. Rejects only when no response arrived (offline, timeout).
 */
export async function requestJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('The request timed out', 'TimeoutError')),
    timeoutMs,
  );
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as unknown;
    return {
      ok: res.ok,
      status: res.status,
      body: typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {},
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The server's error message, or a status-based fallback. */
export function errorMessage(res: JsonResponse): string {
  const error = res.body.error;
  return typeof error === 'string' && error ? error : `Server error (${res.status})`;
}

/**
 * Shown when creating a numbered document got no response: the server may have created it
 * anyway, and a blind retry would issue a second number.
 */
export const NO_RESPONSE_ON_CREATE =
  'No response from the server. The document may have been created anyway — check the list ' +
  'before trying again.';
