import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { InternalApiClient } from "./internal-api-client";

type FetchCall = [RequestInfo | URL, RequestInit | undefined];

function fakeFetch(response: () => Response | Promise<Response>) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    response(),
  );
}

function client(
  fetchImpl: ReturnType<typeof fakeFetch>,
  options: Partial<ConstructorParameters<typeof InternalApiClient>[0]> = {},
) {
  return new InternalApiClient({
    baseUrl: "http://api.test",
    token: "session-token",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...options,
  });
}

function sent(fetchImpl: ReturnType<typeof fakeFetch>) {
  const [input, init] = fetchImpl.mock.calls.at(-1) as FetchCall;
  return { url: String(input), init, headers: new Headers(init?.headers) };
}

// Waits for the request signal to abort, like a server that never answers.
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("InternalApiClient", () => {
  it("sends the session token and returns the parsed body", async () => {
    const fetchImpl = fakeFetch(() => Response.json({ id: "t1" }));
    const api = client(fetchImpl);

    await expect(api.json("api/task/t1")).resolves.toEqual({ id: "t1" });

    const request = sent(fetchImpl);
    expect(request.url).toBe("http://api.test/api/task/t1");
    expect(request.headers.get("authorization")).toBe("Bearer session-token");
    expect(request.headers.has("content-type")).toBe(false);
    expect(request.init?.signal).toBeInstanceOf(AbortSignal);
    expect(api.usingApiKey).toBe(false);
    expect(api.lastOutcome).toEqual({ kind: "status", status: 200 });
  });

  it("marks JSON bodies and keeps an explicit content type", async () => {
    const fetchImpl = fakeFetch(() => Response.json({}));
    const api = client(fetchImpl);

    await api.json("/api/task", { method: "POST", body: "{}" });
    expect(sent(fetchImpl).headers.get("content-type")).toBe(
      "application/json",
    );

    await api.json("/api/task", {
      method: "POST",
      body: "a=b",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(sent(fetchImpl).headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("adds extra headers without letting them replace the token", async () => {
    const fetchImpl = fakeFetch(() => Response.json({}));
    const api = client(fetchImpl, {
      extraHeaders: {
        "X-Kaneo-Assistant-Workspace": "ws-1",
        Authorization: "Bearer other",
      },
    });

    await api.json("/api/project", {
      headers: { "X-Kaneo-Assistant-Workspace": "ws-2" },
    });

    const { headers } = sent(fetchImpl);
    expect(headers.get("x-kaneo-assistant-workspace")).toBe("ws-1");
    expect(headers.get("authorization")).toBe("Bearer session-token");
  });

  it.each(["POST", "put", "PATCH", "DELETE"])(
    "refuses %s in read-only mode before sending anything",
    async (method) => {
      const fetchImpl = fakeFetch(() => Response.json({}));
      const api = client(fetchImpl, { readOnly: true });

      await expect(api.json("/api/task", { method })).rejects.toThrow(
        "/api/task: read-only",
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(api.lastOutcome).toBeNull();
    },
  );

  it.each([undefined, "GET", "head"])(
    "allows %s in read-only mode",
    async (method) => {
      const fetchImpl = fakeFetch(() => Response.json({ ok: true }));
      const api = client(fetchImpl, { readOnly: true });

      await expect(api.json("/api/task", { method })).resolves.toEqual({
        ok: true,
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [
      Response.json({ message: "Task not found" }, { status: 404 }),
      "Task not found",
    ],
    [new Response("x".repeat(600), { status: 500 }), "x".repeat(500)],
    [new Response(null, { status: 403 }), "HTTP 403"],
    [
      Response.json({ message: "y".repeat(600) }, { status: 400 }),
      "y".repeat(500),
    ],
  ])("throws path-prefixed errors for failures", async (response, detail) => {
    const api = client(fakeFetch(() => response));

    await expect(api.json("/api/task/t1")).rejects.toThrow(
      new Error(`/api/task/t1: ${detail}`),
    );
    expect(api.lastOutcome).toEqual({
      kind: "status",
      status: response.status,
    });
  });

  it("returns text for non-JSON bodies and null for empty ones", async () => {
    await expect(
      client(fakeFetch(() => new Response("plain"))).json("/a"),
    ).resolves.toBe("plain");
    await expect(
      client(fakeFetch(() => new Response(null, { status: 204 }))).json("/a"),
    ).resolves.toBeNull();
  });

  it("records a timeout when the API does not answer in time", async () => {
    const api = client(hangingFetch(), { timeoutMs: 20 });

    await expect(api.json("/api/task")).rejects.toThrow();
    expect(api.lastOutcome).toEqual({ kind: "timeout" });
  });

  it("leaves the outcome unknown when a 2xx body never finishes", async () => {
    const stalledBody = (signal: AbortSignal | null | undefined) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":'));
          signal?.addEventListener("abort", () =>
            controller.error(signal.reason),
          );
        },
      });
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Response(stalledBody(init?.signal), { status: 201 }),
    );
    const api = client(fetchImpl, { timeoutMs: 20 });

    await expect(api.json("/api/task/1", { method: "POST" })).rejects.toThrow();
    expect(api.lastOutcome).toEqual({ kind: "timeout" });
  });

  it("records a network failure", async () => {
    const api = client(
      fakeFetch(() => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(api.json("/api/task")).rejects.toThrow("fetch failed");
    expect(api.lastOutcome).toEqual({ kind: "network" });
  });

  it("treats a caller abort as a network failure, not a timeout", async () => {
    const api = client(hangingFetch());
    const controller = new AbortController();

    const request = api.json("/api/task", { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toThrow();
    expect(api.lastOutcome).toEqual({ kind: "network" });
  });

  it("clears the previous outcome on each request", async () => {
    const api = client(
      fakeFetch(() => Response.json({})),
      { readOnly: true },
    );

    await api.json("/api/task");
    expect(api.lastOutcome).toEqual({ kind: "status", status: 200 });

    await expect(api.json("/api/task", { method: "POST" })).rejects.toThrow();
    expect(api.lastOutcome).toBeNull();
  });

  it("runs each request through the limiter", async () => {
    const fetchImpl = fakeFetch(() => Response.json({ ok: true }));
    let runs = 0;
    const limiter = {
      run<T>(fn: () => Promise<T>) {
        runs += 1;
        return fn();
      },
    };
    const api = client(fetchImpl, { limiter });

    await expect(api.json("/api/task")).resolves.toEqual({ ok: true });
    expect(runs).toBe(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("starts the timeout only once the limiter lets the request through", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        init?.signal?.throwIfAborted();
        return Response.json({ ok: true });
      },
    );
    const api = client(fetchImpl, {
      timeoutMs: 20,
      limiter: {
        run: async (fn) => {
          await gate;
          return fn();
        },
      },
    });

    const request = api.json("/api/task");
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();

    await expect(request).resolves.toEqual({ ok: true });
  });

  it("uses the global fetch at call time when none is injected", async () => {
    const api = new InternalApiClient({
      baseUrl: "http://api.test",
      token: "session-token",
    });
    const globalFetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", globalFetch);

    await expect(api.json("/api/task")).resolves.toEqual({ ok: true });
    expect(globalFetch).toHaveBeenCalledOnce();
  });
});
