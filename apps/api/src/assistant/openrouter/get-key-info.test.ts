import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { getOpenRouterKeyInfo, parseKeyInfo } from "./get-key-info";

const KEY = "sk-or-v1-test-0123456789abcdef";

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseKeyInfo", () => {
  it("maps OpenRouter's key payload", () => {
    expect(
      parseKeyInfo({
        data: {
          label: "sk-or-v1-abc...",
          usage: 1.25,
          limit: 10,
          limit_remaining: 8.75,
          is_free_tier: false,
        },
      }),
    ).toEqual({
      usageUsd: 1.25,
      limitUsd: 10,
      limitRemainingUsd: 8.75,
      isFreeTier: false,
    });
  });

  it("treats missing limits as none", () => {
    expect(parseKeyInfo({ data: { usage: 0, limit: null } })).toEqual({
      usageUsd: 0,
      limitUsd: null,
      limitRemainingUsd: null,
      isFreeTier: false,
    });
  });

  it.each([null, {}, { data: {} }, { data: { usage: "1" } }])(
    "rejects %j as unreachable",
    (payload) => {
      expect(() => parseKeyInfo(payload)).toThrow(
        expect.objectContaining({ code: "OPENROUTER_UNREACHABLE" }),
      );
    },
  );
});

describe("getOpenRouterKeyInfo", () => {
  it("sends the key to GET /key without following redirects", async () => {
    const fetchMock = stubFetch(async () =>
      Response.json({ data: { usage: 2, limit: 5, limit_remaining: 3 } }),
    );

    await expect(getOpenRouterKeyInfo(KEY)).resolves.toEqual({
      usageUsd: 2,
      limitUsd: 5,
      limitRemainingUsd: 3,
      isFreeTier: false,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/key");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${KEY}`,
    );
  });

  it("reports a rejected key", async () => {
    stubFetch(async () =>
      Response.json({ error: { message: `bad key ${KEY}` } }, { status: 401 }),
    );
    const error = await getOpenRouterKeyInfo(KEY).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "OPENROUTER_KEY_INVALID",
      status: 401,
    });
    expect(String((error as Error).message)).not.toContain(KEY);
  });

  it.each([403, 429, 500, 503])(
    "reports HTTP %i as unreachable",
    async (status) => {
      stubFetch(async () => new Response("nope", { status }));
      await expect(getOpenRouterKeyInfo(KEY)).rejects.toMatchObject({
        code: "OPENROUTER_UNREACHABLE",
        status,
      });
    },
  );

  it("reports a network failure without its cause", async () => {
    stubFetch(async () => {
      throw new TypeError(`fetch failed for ${KEY}`);
    });
    const error = await getOpenRouterKeyInfo(KEY).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "OPENROUTER_UNREACHABLE" });
    expect(String((error as Error).message)).not.toContain(KEY);
    expect((error as Error).cause).toBeUndefined();
  });

  it("stops when the caller aborts", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const controller = new AbortController();
    const pending = getOpenRouterKeyInfo(KEY, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "OPENROUTER_UNREACHABLE",
    });
  });
});
