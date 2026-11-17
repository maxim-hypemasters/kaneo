import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  getModelLimits,
  listToolModels,
  resetToolModelsCache,
  resolveSupportedModel,
} from "./list-tool-models";

const PAYLOAD = {
  data: [
    {
      id: "anthropic/claude-sonnet-5.5",
      canonical_slug: "anthropic/claude-sonnet-5.5-20261001",
      name: "Claude Sonnet 5.5",
      context_length: 1_000_000,
      top_provider: { max_completion_tokens: 128_000 },
      pricing: { prompt: "0.000003", completion: "0.000015" },
    },
    { id: "anthropic/claude-sonnet-5.5:batch", name: "Batch" },
  ],
};

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetToolModelsCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("listToolModels", () => {
  it("requests tool-capable models without a key", async () => {
    const fetchMock = stubFetch(async () => Response.json(PAYLOAD));

    const models = await listToolModels();

    expect(models.map((model) => model.id)).toEqual([
      "anthropic/claude-sonnet-5.5",
    ]);
    const [url, init] = (fetchMock.mock.calls[0] ?? []) as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://openrouter.ai/api/v1/models?supported_parameters=tools",
    );
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it("caches the list for an hour and shares one request", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = stubFetch(async () => Response.json(PAYLOAD));

    await Promise.all([listToolModels(), listToolModels()]);
    await listToolModels();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1);
    await listToolModels();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    const fetchMock = stubFetch(
      async () => new Response("down", { status: 503 }),
    );

    await expect(listToolModels()).rejects.toMatchObject({
      code: "OPENROUTER_UNREACHABLE",
      status: 503,
    });
    fetchMock.mockImplementation(async () => Response.json(PAYLOAD));
    await expect(listToolModels()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a network failure as unreachable", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(listToolModels()).rejects.toMatchObject({
      code: "OPENROUTER_UNREACHABLE",
    });
  });
});

describe("resolveSupportedModel", () => {
  it("resolves ids and canonical slugs from the cached list", async () => {
    stubFetch(async () => Response.json(PAYLOAD));
    await expect(
      resolveSupportedModel("anthropic/claude-sonnet-5.5-20261001"),
    ).resolves.toBe("anthropic/claude-sonnet-5.5");
    await expect(
      resolveSupportedModel("anthropic/claude-sonnet-5.5:batch"),
    ).resolves.toBeNull();
  });
});

describe("getModelLimits", () => {
  const SONNET = "anthropic/claude-sonnet-5.5";
  const LIMITS = { contextLength: 1_000_000, maxCompletionTokens: 128_000 };

  it("reads the limits from the cached list", async () => {
    const fetchMock = stubFetch(async () => Response.json(PAYLOAD));
    await expect(getModelLimits(SONNET)).resolves.toEqual(LIMITS);
    await expect(
      getModelLimits("anthropic/claude-sonnet-5.5-20261001"),
    ).resolves.toEqual(LIMITS);
    await expect(getModelLimits("openai/unknown")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers null after a failed load and waits a minute to retry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = stubFetch(
      async () => new Response("down", { status: 503 }),
    );
    await expect(getModelLimits(SONNET)).resolves.toBeNull();
    await expect(getModelLimits(SONNET)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => Response.json(PAYLOAD));
    vi.setSystemTime(Date.now() + 60_001);
    await expect(getModelLimits(SONNET)).resolves.toEqual(LIMITS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers from an expired list while a fresh one loads", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetchMock = stubFetch(async () => Response.json(PAYLOAD));
    await getModelLimits(SONNET);

    vi.setSystemTime(Date.now() + 60 * 60 * 1000 + 1);
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    await expect(getModelLimits(SONNET)).resolves.toEqual(LIMITS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The refresh that started replaces the list once it arrives.
    finish(Response.json({ data: [] }));
    await expect(listToolModels()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
