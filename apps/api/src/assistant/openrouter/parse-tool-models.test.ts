import { describe, expect, it } from "vite-plus/test";
import {
  MAX_TOOL_MODELS,
  parseToolModels,
  perMillionTokens,
  resolveToolModel,
  toolModelLimits,
} from "./parse-tool-models";

const NOW = new Date("2026-11-16T12:00:00Z");
const RECOMMENDED = [
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
];

function entry(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    canonical_slug: `${id}-20261001`,
    name: id.toUpperCase(),
    context_length: 200_000,
    architecture: { output_modalities: ["text"] },
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["tools", "tool_choice"],
    ...extra,
  };
}

function ids(payload: unknown) {
  return parseToolModels(payload, NOW, RECOMMENDED).models.map((m) => m.id);
}

describe("parseToolModels", () => {
  it("maps a model with per-million prices", () => {
    const { models } = parseToolModels(
      {
        data: [
          entry("anthropic/claude-sonnet-5.5", { name: "Claude Sonnet 5.5" }),
        ],
      },
      NOW,
      RECOMMENDED,
    );
    expect(models).toEqual([
      {
        id: "anthropic/claude-sonnet-5.5",
        name: "Claude Sonnet 5.5",
        contextLength: 200_000,
        promptPerMTokUsd: 3,
        completionPerMTokUsd: 15,
        recommended: true,
      },
    ]);
  });

  it("drops batch, expired, non-chat and tool-less models", () => {
    expect(
      ids({
        data: [
          entry("kept/a"),
          entry("batch/a:batch"),
          entry("expired/a", { expiration_date: "2026-11-01" }),
          entry("expiring-later/a", { expiration_date: "2027-01-01" }),
          entry("embeddings/a", {
            endpoints: ["/api/v1/embeddings"],
          }),
          entry("chat/a", {
            endpoints: ["/api/v1/chat/completions", "/api/v1/responses"],
          }),
          entry("chat-objects/a", {
            endpoints: [{ path: "/api/v1/chat/completions" }],
          }),
          entry("unknown-endpoints/a", { endpoints: [{ name: "x" }] }),
          entry("image/a", {
            architecture: { output_modalities: ["image"] },
          }),
          entry("no-tools/a", { supported_parameters: ["temperature"] }),
        ],
      }).sort(),
    ).toEqual([
      "chat-objects/a",
      "chat/a",
      "expiring-later/a",
      "kept/a",
      "unknown-endpoints/a",
    ]);
  });

  it("skips malformed and duplicate entries", () => {
    expect(
      ids({
        data: [
          null,
          "x",
          { name: "no id" },
          { id: "" },
          entry("dup/a", { name: "First" }),
          entry("dup/a", { name: "Second" }),
        ],
      }),
    ).toEqual(["dup/a"]);
  });

  it("puts recommended models first, then sorts by name", () => {
    expect(
      ids({
        data: [
          entry("b/model", { name: "Beta" }),
          entry("anthropic/claude-haiku-5.5", { name: "Haiku" }),
          entry("a/model", { name: "Alpha" }),
          entry("anthropic/claude-sonnet-5.5", { name: "Sonnet" }),
        ],
      }),
    ).toEqual([
      "anthropic/claude-sonnet-5.5",
      "anthropic/claude-haiku-5.5",
      "a/model",
      "b/model",
    ]);
  });

  it("falls back for missing names, context and prices", () => {
    const { models } = parseToolModels(
      {
        data: [
          {
            id: "bare/model",
            top_provider: { context_length: 8192 },
            pricing: { prompt: "-1" },
          },
        ],
      },
      NOW,
      RECOMMENDED,
    );
    expect(models).toEqual([
      {
        id: "bare/model",
        name: "bare/model",
        contextLength: 8192,
        promptPerMTokUsd: null,
        completionPerMTokUsd: null,
        recommended: false,
      },
    ]);
  });

  it(`keeps at most ${MAX_TOOL_MODELS} models`, () => {
    const data = Array.from({ length: MAX_TOOL_MODELS + 5 }, (_, index) =>
      entry(`vendor/model-${String(index).padStart(5, "0")}`),
    );
    expect(ids({ data })).toHaveLength(MAX_TOOL_MODELS);
  });

  it.each([null, [], {}, { data: {} }])(
    "rejects %j as unreachable",
    (payload) => {
      expect(() => parseToolModels(payload, NOW, RECOMMENDED)).toThrow(
        expect.objectContaining({ code: "OPENROUTER_UNREACHABLE" }),
      );
    },
  );
});

describe("resolveToolModel", () => {
  const catalog = parseToolModels(
    {
      data: [
        entry("anthropic/claude-sonnet-5.5", {
          canonical_slug: "anthropic/claude-sonnet-5.5-20261001",
        }),
        entry("same/slug", { canonical_slug: "same/slug" }),
      ],
    },
    NOW,
    RECOMMENDED,
  );

  it("matches an id or maps a canonical slug to it", () => {
    expect(resolveToolModel(catalog, "anthropic/claude-sonnet-5.5")).toBe(
      "anthropic/claude-sonnet-5.5",
    );
    expect(
      resolveToolModel(catalog, "anthropic/claude-sonnet-5.5-20261001"),
    ).toBe("anthropic/claude-sonnet-5.5");
    expect(resolveToolModel(catalog, "same/slug")).toBe("same/slug");
  });

  it("returns null for anything else", () => {
    expect(resolveToolModel(catalog, "openai/unknown")).toBeNull();
    expect(resolveToolModel(catalog, "")).toBeNull();
  });
});

describe("toolModelLimits", () => {
  const catalog = parseToolModels(
    {
      data: [
        entry("anthropic/claude-sonnet-5.5", {
          canonical_slug: "anthropic/claude-sonnet-5.5-20261001",
          context_length: 1_000_000,
          top_provider: {
            context_length: 1_000_000,
            max_completion_tokens: 128_000,
          },
        }),
        entry("fallback/context", {
          context_length: null,
          top_provider: { context_length: 32_768 },
        }),
        entry("bad/limits", {
          context_length: 0,
          top_provider: { max_completion_tokens: -5 },
        }),
        entry("float/limit", { top_provider: { max_completion_tokens: 1.5 } }),
        entry("dropped/a:batch", {
          top_provider: { max_completion_tokens: 10 },
        }),
      ],
    },
    NOW,
    RECOMMENDED,
  );

  it("reads the context length and the top provider's completion limit", () => {
    const sonnet = { contextLength: 1_000_000, maxCompletionTokens: 128_000 };
    expect(toolModelLimits(catalog, "anthropic/claude-sonnet-5.5")).toEqual(
      sonnet,
    );
    expect(
      toolModelLimits(catalog, "anthropic/claude-sonnet-5.5-20261001"),
    ).toEqual(sonnet);
    expect(toolModelLimits(catalog, "fallback/context")).toEqual({
      contextLength: 32_768,
      maxCompletionTokens: null,
    });
  });

  it("treats missing or unusable limits as unknown", () => {
    expect(toolModelLimits(catalog, "bad/limits")).toEqual({
      contextLength: null,
      maxCompletionTokens: null,
    });
    expect(toolModelLimits(catalog, "float/limit")).toEqual({
      contextLength: 200_000,
      maxCompletionTokens: null,
    });
  });

  it("knows no limits for a model that isn't offered", () => {
    expect(toolModelLimits(catalog, "dropped/a:batch")).toBeNull();
    expect(toolModelLimits(catalog, "openai/unknown")).toBeNull();
    expect(catalog.limits.has("dropped/a:batch")).toBe(false);
  });

  it("keeps limits only for the models it keeps", () => {
    const data = Array.from({ length: MAX_TOOL_MODELS + 5 }, (_, index) =>
      entry(`vendor/model-${String(index).padStart(5, "0")}`),
    );
    const capped = parseToolModels({ data }, NOW, RECOMMENDED);
    expect(capped.limits.size).toBe(MAX_TOOL_MODELS);
  });
});

describe("perMillionTokens", () => {
  it.each([
    ["0.000003", 3],
    ["0.0000008", 0.8],
    ["0", 0],
    [0.000015, 15],
    ["-1", null],
    ["abc", null],
    [undefined, null],
    [null, null],
  ])("maps %j to %j", (price, expected) => {
    expect(perMillionTokens(price)).toBe(expected);
  });
});
