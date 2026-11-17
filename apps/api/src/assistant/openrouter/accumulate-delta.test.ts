import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { createDeltaAccumulator } from "./accumulate-delta";

// The recorded-style stream, as parsed chunk objects.
const FIXTURE_CHUNKS: unknown[] = readFileSync(
  new URL(
    "../../../../../tests/api/assistant/fixtures/sonnet-5.5-parallel-tool-calls.sse",
    import.meta.url,
  ),
  "utf8",
)
  .split("\n")
  .filter((line) => line.startsWith("data: {"))
  .map((line) => JSON.parse(line.slice("data: ".length)));

function chunk(
  delta: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  finishReason: string | null = null,
) {
  return {
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...extra,
  };
}

function toolFragment(
  index: number,
  args: string,
  head?: { id: string; name: string },
) {
  return chunk({
    tool_calls: [
      {
        index,
        ...(head ? { id: head.id, type: "function" } : {}),
        function: { ...(head ? { name: head.name } : {}), arguments: args },
      },
    ],
  });
}

function accumulate(chunks: unknown[]) {
  const accumulator = createDeltaAccumulator();
  const texts: string[] = [];
  for (const item of chunks) {
    const { text, error } = accumulator.push(item);
    if (error) throw error;
    if (text) texts.push(text);
  }
  return { accumulator, texts, result: accumulator.result() };
}

describe("createDeltaAccumulator", () => {
  it("merges the recorded Sonnet 5.5 stream", () => {
    const { accumulator, texts, result } = accumulate(FIXTURE_CHUNKS);
    expect(texts).toEqual([
      "I’ll look up the",
      " Onboarding feature and",
      " your open bugs — one moment.",
    ]);
    expect(accumulator.hasFinished()).toBe(true);
    expect(result).toEqual({
      content:
        "I’ll look up the Onboarding feature and your open bugs — one moment.",
      toolCalls: [
        {
          id: "toolu_01PZ8mJ4kQx3V9bN2cR7tLwE",
          name: "search",
          arguments: '{"q":"Onboarding","type":"features"}',
        },
        {
          id: "toolu_01Hc6TzW2nRb8YqLx4Vd9KsA",
          name: "list_my_tasks",
          arguments: '{"countOnly":false}',
        },
      ],
      reasoningDetails: [
        {
          type: "reasoning.text",
          text: "The user wants the open work on the Onboarding feature and their own bugs. I’ll search for the Feature and list their assigned tasks in parallel.",
          signature:
            "EqQBCkYIDBgCKkBz3n0Lr8Vq1hJ0cW5yXo2mK7fPj9sT4uD6eA1bN3gH8iC5vR0wQ2xZ7yL4kM9pS6tU1jF3oE8dG5hB2nY0aV7EgwqZm9vYmFyZXhhbXBsZRoM",
          format: "anthropic-claude-v1",
          index: 0,
        },
      ],
      finishReason: "tool_calls",
      usage: { promptTokens: 9876, completionTokens: 214, costUsd: 0.021892 },
    });
    // The two calls stay separate however their fragments arrive.
    expect(result.toolCalls[0]?.invalid).toBeUndefined();
  });

  it("reports nothing as finished before a finish_reason", () => {
    const accumulator = createDeltaAccumulator();
    expect(accumulator.push(chunk({ content: "Hi" }))).toEqual({ text: "Hi" });
    expect(accumulator.hasFinished()).toBe(false);
    expect(accumulator.result()).toMatchObject({
      content: "Hi",
      finishReason: "stop",
      usage: null,
      reasoningDetails: null,
    });
  });

  it("keeps the first finish_reason when the usage chunk repeats another", () => {
    const { result } = accumulate([
      chunk({ content: "Done." }, {}, "stop"),
      chunk(
        { content: "" },
        { usage: { prompt_tokens: 10, completion_tokens: 2 } },
        "length",
      ),
    ]);
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2 });
  });

  it("reads usage from a chunk without choices", () => {
    const { result } = accumulate([
      chunk({ content: "x" }, {}, "stop"),
      {
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 1, cost: 0 },
      },
    ]);
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 1,
      costUsd: 0,
    });
  });

  it("merges interleaved fragments by index", () => {
    const { result } = accumulate([
      toolFragment(1, "", { id: "call_b", name: "get_task" }),
      toolFragment(0, '{"projectId":', { id: "call_a", name: "list_features" }),
      toolFragment(1, '{"taskId":"t1"}'),
      toolFragment(0, '"p1"}'),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls).toEqual([
      { id: "call_a", name: "list_features", arguments: '{"projectId":"p1"}' },
      { id: "call_b", name: "get_task", arguments: '{"taskId":"t1"}' },
    ]);
  });

  it("places fragments with a negative or non-integer index by position", () => {
    const { result } = accumulate([
      chunk({
        tool_calls: [
          {
            index: -1,
            id: "call_a",
            function: { name: "search", arguments: '{"q":"a"}' },
          },
          {
            index: -1,
            id: "call_b",
            function: { name: "get_task", arguments: '{"taskId":"t1"}' },
          },
          {
            index: 1.5,
            id: "call_c",
            function: { name: "list_projects", arguments: "{}" },
          },
        ],
      }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls).toEqual([
      { id: "call_a", name: "search", arguments: '{"q":"a"}' },
      { id: "call_b", name: "get_task", arguments: '{"taskId":"t1"}' },
      { id: "call_c", name: "list_projects", arguments: "{}" },
    ]);
  });

  it("keeps a huge index without allocating for the gap", () => {
    const { result } = accumulate([
      toolFragment(2 ** 31, "{}", { id: "call_far", name: "search" }),
      toolFragment(0, "{}", { id: "call_near", name: "search" }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls.map((call) => call.id)).toEqual([
      "call_near",
      "call_far",
    ]);
  });

  it("orders sparse indexes and falls back to array position", () => {
    const { result } = accumulate([
      chunk({
        tool_calls: [
          { id: "call_a", function: { name: "a", arguments: "{}" } },
          { id: "call_b", function: { name: "b", arguments: "{}" } },
        ],
      }),
      toolFragment(5, "{}", { id: "call_c", name: "c" }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls.map((call) => call.id)).toEqual([
      "call_a",
      "call_b",
      "call_c",
    ]);
  });

  it("keeps the id and name of the first fragment", () => {
    const { result } = accumulate([
      toolFragment(0, '{"a":', { id: "call_first", name: "first" }),
      toolFragment(0, "1}", { id: "call_second", name: "second" }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls).toEqual([
      { id: "call_first", name: "first", arguments: '{"a":1}' },
    ]);
  });

  it.each([
    ["invalid JSON", '{"q": "unterminated'],
    ["an array", "[1,2]"],
    ["a string", '"text"'],
    ["a number", "42"],
    ["null", "null"],
  ])("replays %s arguments as an invalid empty object", (_name, args) => {
    const { result } = accumulate([
      toolFragment(0, args, { id: "call_a", name: "search" }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls).toEqual([
      { id: "call_a", name: "search", arguments: "{}", invalid: true },
    ]);
  });

  it("treats absent arguments as an empty object", () => {
    const { result } = accumulate([
      toolFragment(0, "", { id: "call_a", name: "list_my_tasks" }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls).toEqual([
      { id: "call_a", name: "list_my_tasks", arguments: "{}" },
    ]);
  });

  it("marks every call invalid when the token limit cut the reply", () => {
    const { result } = accumulate([
      toolFragment(0, '{"q":"done"}', { id: "call_a", name: "search" }),
      toolFragment(1, '{"q":"cut', { id: "call_b", name: "search" }),
      chunk({}, {}, "length"),
    ]);
    expect(result.finishReason).toBe("length");
    expect(result.toolCalls).toEqual([
      { id: "call_a", name: "search", arguments: "{}", invalid: true },
      { id: "call_b", name: "search", arguments: "{}", invalid: true },
    ]);
  });

  it("drops a call that never names its tool and ids an anonymous one", () => {
    const { accumulator, result } = accumulate([
      toolFragment(0, '{"a":1}'),
      chunk({
        tool_calls: [
          { index: 1, function: { name: "search", arguments: "{}" } },
        ],
      }),
      chunk({}, {}, "tool_calls"),
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: "search",
      arguments: "{}",
    });
    expect(result.toolCalls[0]?.id).toMatch(/^call_[0-9a-f-]{36}$/);
    // The generated id is stable across result() calls.
    expect(accumulator.result().toolCalls[0]?.id).toBe(result.toolCalls[0]?.id);
  });

  it("merges reasoning_details by index, placing a negative one by position", () => {
    const { result } = accumulate([
      chunk({
        reasoning_details: [
          {
            type: "reasoning.text",
            text: "Think",
            signature: null,
            format: "anthropic-claude-v1",
            index: 0,
          },
        ],
      }),
      chunk({
        reasoning_details: [
          { type: "reasoning.summary", summary: "Sum", index: 1, id: "rs_1" },
        ],
      }),
      chunk({
        reasoning_details: [
          { type: "reasoning.text", text: "ing.", index: 0, format: "other" },
          { type: "reasoning.summary", summary: "mary", index: 1, id: "" },
        ],
      }),
      chunk({
        reasoning_details: [
          { type: "reasoning.text", signature: "sig-1", index: 0 },
          { type: "reasoning.encrypted", data: "enc-1", index: 2 },
        ],
      }),
      chunk({
        reasoning_details: [
          { type: "reasoning.text", signature: "sig-2", index: 0 },
          { type: "reasoning.text", signature: "", index: 0 },
          { type: "reasoning.encrypted", data: "enc-2", index: 2 },
          { type: "reasoning.text", text: "kept", index: -1 },
        ],
      }),
      chunk({}, {}, "stop"),
    ]);
    expect(result.reasoningDetails).toEqual([
      {
        type: "reasoning.text",
        text: "Thinking.",
        signature: "sig-2",
        format: "anthropic-claude-v1",
        index: 0,
      },
      { type: "reasoning.summary", summary: "Summary", index: 1, id: "rs_1" },
      { type: "reasoning.encrypted", data: "enc-2", index: 2 },
      // Fourth in its chunk, so it fills slot 3.
      { type: "reasoning.text", text: "kept", index: -1 },
    ]);
  });

  it("keeps a __proto__ key as plain data", () => {
    const { result } = accumulate([
      JSON.parse(
        '{"choices":[{"delta":{"reasoning_details":[{"index":0,"__proto__":{"polluted":true},"text":"a"}]},"finish_reason":"stop"}]}',
      ),
    ]);
    const [detail] = result.reasoningDetails as Record<string, unknown>[];
    expect(Object.hasOwn(detail ?? {}, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((detail as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("returns the error a chunk reports", () => {
    const accumulator = createDeltaAccumulator();
    accumulator.push(chunk({ content: "Partial" }));
    const { error, text } = accumulator.push({
      error: { code: 402, message: "Insufficient credits sk-or-v1-secret" },
      choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }],
    });
    expect(text).toBeUndefined();
    expect(error).toMatchObject({ code: "OPENROUTER_CREDITS" });
    expect(error?.message).not.toContain("sk-or");
    expect(accumulator.hasFinished()).toBe(false);
  });

  it("treats finish_reason error without details as unavailable", () => {
    const { error } = createDeltaAccumulator().push(chunk({}, {}, "error"));
    expect(error).toMatchObject({ code: "OPENROUTER_UNAVAILABLE" });
  });

  it.each([null, "text", 42, [], { choices: "nope" }, { choices: [null] }])(
    "ignores the malformed chunk %j",
    (value) => {
      const accumulator = createDeltaAccumulator();
      expect(accumulator.push(value)).toEqual({});
      expect(accumulator.hasFinished()).toBe(false);
    },
  );

  it.each([
    ["stop", "stop"],
    ["tool_calls", "tool_calls"],
    ["length", "length"],
    ["content_filter", "content_filter"],
  ])("keeps finish_reason %s", (raw, expected) => {
    const { result } = accumulate([chunk({ content: "x" }, {}, raw)]);
    expect(result.finishReason).toBe(expected);
  });

  it("maps an unknown finish_reason by whether calls were made", () => {
    expect(
      accumulate([chunk({ content: "x" }, {}, "end_turn")]).result.finishReason,
    ).toBe("stop");
    expect(
      accumulate([
        toolFragment(0, "{}", { id: "call_a", name: "search" }),
        chunk({}, {}, "tool_use"),
      ]).result.finishReason,
    ).toBe("tool_calls");
  });
});
