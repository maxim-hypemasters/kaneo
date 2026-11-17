import type { ToolClient } from "@kaneo/mcp/tools";

/**
 * How the last request ended. A status means the API answered; a timeout or
 * network failure leaves the outcome of a write unknown.
 */
export type InternalRequestOutcome =
  | { kind: "status"; status: number }
  | { kind: "timeout" }
  | { kind: "network" };

export type InternalApiClientOptions = {
  baseUrl: string;
  token: string;
  extraHeaders?: Record<string, string>;
  /** Refuse any method other than GET or HEAD before anything is sent. */
  readOnly?: boolean;
  timeoutMs?: number;
  /** Optional concurrency limiter around each request. */
  limiter?: { run<T>(fn: () => Promise<T>): Promise<T> };
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_DETAIL_CHARS = 500;
const READ_METHODS = new Set(["GET", "HEAD"]);

type RawResponse = { ok: boolean; status: number; text: string };

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorDetail(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "message" in body) {
    return String((body as { message: unknown }).message).slice(
      0,
      MAX_DETAIL_CHARS,
    );
  }
  if (typeof body === "string" && body.length > 0) {
    return body.slice(0, MAX_DETAIL_CHARS);
  }
  return `HTTP ${status}`;
}

/**
 * Calls this API over HTTP as the session's user, so every request passes the
 * same authentication, permission checks and events as a browser request.
 */
export class InternalApiClient implements ToolClient {
  readonly usingApiKey = false;
  lastOutcome: InternalRequestOutcome | null = null;

  private readonly options: InternalApiClientOptions;

  constructor(options: InternalApiClientOptions) {
    this.options = options;
  }

  async json<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    this.lastOutcome = null;
    const { baseUrl, token, extraHeaders, readOnly, limiter } = this.options;

    const method = (init?.method ?? "GET").toUpperCase();
    if (readOnly && !READ_METHODS.has(method)) {
      throw new Error(`${path}: read-only`);
    }

    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(extraHeaders ?? {})) {
      headers.set(name, value);
    }
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const send = () => this.send(url, { ...init, headers });
    const response = limiter ? await limiter.run(send) : await send();

    const body = parseBody(response.text);
    if (!response.ok) {
      throw new Error(`${path}: ${errorDetail(body, response.status)}`);
    }
    return body as T;
  }

  // The timeout starts when the request leaves the limiter queue, and covers
  // reading the body.
  private async send(url: string, init: RequestInit): Promise<RawResponse> {
    const timeout = AbortSignal.timeout(
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    // Resolved per call so a fetch replaced after construction is used.
    const fetchImpl = this.options.fetchImpl ?? fetch;

    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal });
    } catch (error) {
      this.lastOutcome = timeout.aborted
        ? { kind: "timeout" }
        : { kind: "network" };
      throw error;
    }
    let text: string;
    try {
      text = await res.text();
    } catch (error) {
      // The server may have committed the change; only a full response is a
      // definite outcome.
      this.lastOutcome = timeout.aborted
        ? { kind: "timeout" }
        : { kind: "network" };
      throw error;
    }
    this.lastOutcome = { kind: "status", status: res.status };
    return { ok: res.ok, status: res.status, text };
  }
}
