import { describe, expect, it } from "vite-plus/test";
import type { AssistantToolCall } from "../message-types";
import {
  buildMessages,
  DECIDED_STUBS,
  NOT_RUN_TOOL_RESULT,
  OMITTED_TOOL_RESULT,
  type SizedTranscriptRow,
  stubOnlyToolRows,
  type TranscriptRow,
  toolRowStub,
} from "./build-messages";

const MODEL = "anthropic/claude-sonnet-5.5";
const SYSTEM = "You are the Kaneo assistant.";

let nextId = 0;
const id = () => `row-${++nextId}`;

function user(content: string): TranscriptRow {
  return {
    id: id(),
    role: "user",
    content,
    status: "complete",
    model: null,
    toolCalls: null,
    reasoningDetails: null,
    toolCallId: null,
    approval: null,
    isError: false,
  };
}

function assistant(
  content: string,
  options: Partial<
    Pick<TranscriptRow, "status" | "model" | "reasoningDetails">
  > & { calls?: AssistantToolCall[] } = {},
): TranscriptRow {
  return {
    id: id(),
    role: "assistant",
    content,
    status: options.status ?? "complete",
    model: options.model ?? MODEL,
    toolCalls: options.calls ?? null,
    reasoningDetails: options.reasoningDetails ?? null,
    toolCallId: null,
    approval: null,
    isError: false,
  };
}

function tool(
  toolCallId: string,
  content: string,
  approval: TranscriptRow["approval"] = null,
  extra: Partial<Pick<TranscriptRow, "isError" | "outcomeUnknown">> = {},
): TranscriptRow {
  return {
    id: id(),
    role: "tool",
    content,
    status: "complete",
    model: null,
    toolCalls: null,
    reasoningDetails: null,
    toolCallId,
    approval,
    isError: false,
    ...extra,
  };
}

const call = (callId: string, args = "{}"): AssistantToolCall => ({
  id: callId,
  name: "get_task",
  arguments: args,
});

function build(rows: TranscriptRow[], options: { maxChars?: number } = {}) {
  return buildMessages(rows, {
    model: MODEL,
    systemPrompt: SYSTEM,
    ...options,
  });
}

describe("buildMessages", () => {
  it("starts with the system prompt and replays a tool step in wire order", () => {
    const step = assistant("", {
      calls: [call("c1", '{"id":"t1"}'), call("c2")],
    });
    const first = tool("c1", '{"title":"Fix login"}');
    const second = tool("c2", '{"title":"Ship it"}');
    const { messages, replayedToolRowIds } = build([
      user("What is open?"),
      step,
      first,
      second,
    ]);

    expect(messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: "What is open?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "get_task", arguments: '{"id":"t1"}' },
          },
          {
            id: "c2",
            type: "function",
            function: { name: "get_task", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: '{"title":"Fix login"}' },
      { role: "tool", tool_call_id: "c2", content: '{"title":"Ship it"}' },
    ]);
    expect(replayedToolRowIds).toEqual(new Set([first.id, second.id]));
  });

  it("never ends on an assistant message", () => {
    const { messages } = build([
      user("Hi"),
      assistant("Hello! How can I help?"),
    ]);
    expect(messages.at(-1)).toEqual({ role: "user", content: "Hi" });

    const later = build([
      user("Hi"),
      assistant("Hello!"),
      user("List my tasks"),
      assistant("Here they are."),
    ]).messages;
    expect(later.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("keeps text next to tool calls and sends null only with calls", () => {
    const { messages } = build([
      user("Check KAN-1"),
      assistant("Let me look.", { calls: [call("c1")] }),
      tool("c1", "{}"),
    ]);
    expect(messages[2]).toMatchObject({
      role: "assistant",
      content: "Let me look.",
    });
  });

  it("excludes interrupted assistant rows and their stray tool rows", () => {
    const { messages, replayedToolRowIds } = build([
      user("Summarize the feature"),
      assistant("Partial answ", { status: "interrupted" }),
      assistant("", { status: "interrupted", calls: [call("c9")] }),
      tool("c9", "stray"),
    ]);
    expect(messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: "Summarize the feature" },
    ]);
    expect(replayedToolRowIds.size).toBe(0);
  });

  it("excludes assistant rows with neither text nor calls", () => {
    const { messages } = build([
      user("Hi"),
      assistant("   "),
      assistant("", { calls: [] }),
    ]);
    expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("answers every call exactly once, in tool_calls order", () => {
    const later = tool("c2", "second");
    const earlier = tool("c1", "first");
    const duplicate = tool("c1", "duplicate");
    const { messages, replayedToolRowIds } = build([
      user("Go"),
      assistant("", { calls: [call("c1"), call("c2"), call("c3")] }),
      later,
      earlier,
      duplicate,
    ]);

    expect(messages.slice(3)).toEqual([
      { role: "tool", tool_call_id: "c1", content: "first" },
      { role: "tool", tool_call_id: "c2", content: "second" },
      { role: "tool", tool_call_id: "c3", content: NOT_RUN_TOOL_RESULT },
    ]);
    expect(replayedToolRowIds).toEqual(new Set([earlier.id, later.id]));
  });

  it("synthesizes results when a step's tool rows are missing", () => {
    const { messages } = build([
      user("Go"),
      assistant("", { calls: [call("c1"), call("c2")] }),
    ]);
    expect(messages.slice(3)).toEqual([
      { role: "tool", tool_call_id: "c1", content: NOT_RUN_TOOL_RESULT },
      { role: "tool", tool_call_id: "c2", content: NOT_RUN_TOOL_RESULT },
    ]);
  });

  it("matches results within their own step when call ids repeat", () => {
    const { messages } = build([
      user("Go"),
      assistant("", { calls: [call("call_0")] }),
      tool("call_0", "step one"),
      assistant("", { calls: [call("call_0")] }),
    ]);
    expect(messages.slice(3)).toEqual([
      { role: "tool", tool_call_id: "call_0", content: "step one" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_0_2",
            type: "function",
            function: { name: "get_task", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_0_2", content: NOT_RUN_TOOL_RESULT },
    ]);
  });

  it("renames a call id an earlier step used, on the call and its result", () => {
    const rows = [
      user("Go"),
      assistant("", { calls: [call("call_0"), call("call_1")] }),
      tool("call_0", "one"),
      tool("call_1", "two"),
      assistant("", { calls: [call("call_1"), call("call_0")] }),
      tool("call_0", "three"),
      tool("call_1", "four"),
      // Its own id is the one the step above was renamed to.
      assistant("", { calls: [call("call_0_2"), call("call_0")] }),
      tool("call_0_2", "five"),
      tool("call_0", "six"),
    ];
    const { messages } = build(rows);
    const ids = messages.flatMap((message) =>
      message.role === "assistant"
        ? [(message.tool_calls ?? []).map((wire) => wire.id)]
        : [],
    );
    expect(ids).toEqual([
      ["call_0", "call_1"],
      ["call_1_2", "call_0_2"],
      ["call_0_2_2", "call_0_3"],
    ]);
    expect(
      messages.flatMap((message) =>
        message.role === "tool"
          ? [[message.tool_call_id, message.content]]
          : [],
      ),
    ).toEqual([
      ["call_0", "one"],
      ["call_1", "two"],
      ["call_1_2", "four"],
      ["call_0_2", "three"],
      ["call_0_2_2", "five"],
      ["call_0_3", "six"],
    ]);
    // The stored rows keep their ids.
    expect(rows[4]?.toolCalls?.map((stored) => stored.id)).toEqual([
      "call_1",
      "call_0",
    ]);
    // The same rows always give the same names.
    expect(build(rows).messages).toEqual(messages);
  });

  it("uses the stored content of rejected and skipped proposals", () => {
    const { messages } = build([
      user("Rename it"),
      assistant("", { calls: [call("c1"), call("c2"), call("c3")] }),
      tool("c1", "The user rejected this change.", "rejected"),
      tool("c2", "", "skipped"),
      tool("c3", '{"ok":true}', "approved"),
    ]);
    expect(messages.slice(3)).toEqual([
      {
        role: "tool",
        tool_call_id: "c1",
        content: "The user rejected this change.",
      },
      {
        role: "tool",
        tool_call_id: "c2",
        content: "Skipped: the user sent a new message instead of approving.",
      },
      { role: "tool", tool_call_id: "c3", content: '{"ok":true}' },
    ]);
  });

  it("throws while a proposal is pending", () => {
    expect(() =>
      build([
        user("Rename it"),
        assistant("", { calls: [call("c1")] }),
        tool("c1", "", "pending"),
      ]),
    ).toThrow(/pending/);
  });

  it("throws without a user message", () => {
    expect(() => build([])).toThrow(/no user message/);
  });

  it("replays reasoning only for rows from the current model", () => {
    const reasoning = [{ type: "reasoning.text", text: "thinking", index: 0 }];
    const { messages } = build([
      user("Go"),
      assistant("", {
        calls: [call("c1")],
        reasoningDetails: reasoning,
      }),
      tool("c1", "a"),
      assistant("", {
        calls: [call("c2")],
        reasoningDetails: reasoning,
        model: "openai/gpt-6-mini",
      }),
      tool("c2", "b"),
      assistant("", { calls: [call("c3")], reasoningDetails: [] }),
      tool("c3", "c"),
    ]);
    const assistants = messages.filter(
      (message) => message.role === "assistant",
    );
    expect(assistants[0]).toHaveProperty("reasoning_details", reasoning);
    expect(assistants[1]).not.toHaveProperty("reasoning_details");
    expect(assistants[2]).not.toHaveProperty("reasoning_details");
  });

  it("replays invalid stored arguments as an empty object", () => {
    const { messages } = build([
      user("Go"),
      assistant("", {
        calls: [call("c1", '{"id": "t1"'), call("c2", "[1]")],
      }),
      tool("c1", "error"),
      tool("c2", "error"),
    ]);
    const step = messages[2];
    expect(step?.role === "assistant" && step.tool_calls).toEqual([
      expect.objectContaining({
        function: { name: "get_task", arguments: "{}" },
      }),
      expect.objectContaining({
        function: { name: "get_task", arguments: "{}" },
      }),
    ]);
  });

  it("merges user messages left by a turn that failed", () => {
    const { messages } = build([user("First try"), user("Second try")]);
    expect(messages).toEqual([
      { role: "system", content: SYSTEM },
      { role: "user", content: "First try\n\nSecond try" },
    ]);
  });

  describe("history window", () => {
    const big = (char: string) => char.repeat(400);

    it("stubs older tool results once the newest fill the window", () => {
      const oldest = tool("c1", big("a"));
      const middle = tool("c2", big("b"));
      const newest = tool("c3", big("c"));
      const { messages, replayedToolRowIds } = build(
        [
          user("Go"),
          assistant("", { calls: [call("c1")] }),
          oldest,
          assistant("", { calls: [call("c2")] }),
          middle,
          assistant("", { calls: [call("c3")] }),
          newest,
        ],
        { maxChars: 1000 },
      );

      const results = messages.filter((message) => message.role === "tool");
      expect(results.map((message) => message.content)).toEqual([
        OMITTED_TOOL_RESULT,
        big("b"),
        big("c"),
      ]);
      expect(replayedToolRowIds).toEqual(new Set([middle.id, newest.id]));
    });

    it("keeps stubbing older results even when a small one would fit", () => {
      const small = tool("c1", "x".repeat(60));
      const large = tool("c2", big("b"));
      const newest = tool("c3", big("c"));
      const { replayedToolRowIds, messages } = build(
        [
          user("Go"),
          assistant("", { calls: [call("c1")] }),
          small,
          assistant("", { calls: [call("c2")] }),
          large,
          assistant("", { calls: [call("c3")] }),
          newest,
        ],
        { maxChars: 700 },
      );
      expect(replayedToolRowIds).toEqual(new Set([newest.id]));
      expect(
        messages
          .filter((message) => message.role === "tool")
          .map((message) => message.content),
      ).toEqual([OMITTED_TOOL_RESULT, OMITTED_TOOL_RESULT, big("c")]);
    });

    it("starts at a user message and drops older turns that don't fit", () => {
      const { messages } = build(
        [
          user(big("1")),
          assistant(big("A")),
          user("second question"),
          assistant("second answer"),
          user("third question"),
        ],
        { maxChars: 500 },
      );
      expect(messages).toEqual([
        { role: "system", content: SYSTEM },
        { role: "user", content: "second question" },
        { role: "assistant", content: "second answer" },
        { role: "user", content: "third question" },
      ]);
    });

    it("always keeps the latest turn, even when it alone is too big", () => {
      const result = tool("c1", big("r"));
      const { messages, replayedToolRowIds } = build(
        [
          user("old"),
          assistant("old answer"),
          user(big("q")),
          assistant("", { calls: [call("c1")] }),
          result,
        ],
        { maxChars: 100 },
      );
      expect(messages.map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "tool",
      ]);
      expect(messages[1]).toEqual({ role: "user", content: big("q") });
      expect(messages[3]).toMatchObject({ content: OMITTED_TOOL_RESULT });
      expect(replayedToolRowIds.size).toBe(0);
    });

    it("counts replayed reasoning against the window", () => {
      const reasoningDetails = [
        { type: "reasoning.text", text: big("r"), signature: "sig" },
      ];
      const rows = [
        user("first"),
        assistant("", { calls: [call("c1")], reasoningDetails }),
        tool("c1", "ok"),
        assistant("done"),
        user("second"),
      ];
      expect(
        build(rows, { maxChars: 300 }).messages.map((message) => message.role),
      ).toEqual(["system", "user"]);
      // Reasoning of another model isn't replayed, so it takes no room.
      const otherModel = buildMessages(rows, {
        model: "openai/gpt-6-mini",
        systemPrompt: SYSTEM,
        maxChars: 300,
      }).messages;
      expect(otherModel.map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "tool",
        "assistant",
        "user",
      ]);
    });

    it("only stubs a tool row whose content wasn't loaded, and every older one", () => {
      const older = tool("c1", "x".repeat(60));
      const omitted: TranscriptRow = {
        ...tool("c2", ""),
        contentOmitted: true,
      };
      const newest = tool("c3", "fits");
      const { messages, replayedToolRowIds } = build([
        user("Go"),
        assistant("", { calls: [call("c1")] }),
        older,
        assistant("", { calls: [call("c2")] }),
        omitted,
        assistant("", { calls: [call("c3")] }),
        newest,
      ]);
      expect(
        messages
          .filter((message) => message.role === "tool")
          .map((message) => message.content),
      ).toEqual([OMITTED_TOOL_RESULT, OMITTED_TOOL_RESULT, "fits"]);
      expect(replayedToolRowIds).toEqual(new Set([newest.id]));
    });

    it("stubs a decided write by its decision, never asking to call it again", () => {
      const rows = [
        tool(
          "c1",
          "The user rejected this action. Do not retry it unless asked.",
          "rejected",
        ),
        tool("c2", "Not run: the user sent a new message instead.", "skipped"),
        tool("c3", big("d"), "approved"),
        tool("c4", big("e"), "approved", { isError: true }),
        // Unknown outcomes: timed out, and claimed but never finished.
        tool("c5", "Outcome unknown; check before retrying.", "approved", {
          isError: true,
          outcomeUnknown: true,
        }),
        tool("c6", DECIDED_STUBS.unknown, "approved", { outcomeUnknown: true }),
        tool("c7", big("r")),
      ];
      const { messages } = build(
        [
          user("Go"),
          assistant("", {
            calls: ["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map((c) =>
              call(c),
            ),
          }),
          ...rows,
        ],
        { maxChars: 0 },
      );
      expect(
        messages
          .filter((message) => message.role === "tool")
          .map((message) => message.content),
      ).toEqual([
        DECIDED_STUBS.rejected,
        DECIDED_STUBS.skipped,
        DECIDED_STUBS.done,
        DECIDED_STUBS.failed,
        // No stub is shorter, so an unknown outcome is never called done.
        "Outcome unknown; check before retrying.",
        DECIDED_STUBS.unknown,
        OMITTED_TOOL_RESULT,
      ]);
    });

    it("replays a do-not-retry text for a rejection outside the window", () => {
      const rejected = tool(
        "c1",
        "The user rejected this action. Do not retry it unless asked.",
        "rejected",
      );
      const { messages } = build(
        [
          user("Go"),
          assistant("", { calls: [call("c1")] }),
          rejected,
          assistant("", { calls: [call("c2")] }),
          tool("c2", big("n")),
        ],
        { maxChars: 450 },
      );
      expect(messages[3]).toEqual({
        role: "tool",
        tool_call_id: "c1",
        content: "Rejected by the user. Do not retry unless asked.",
      });
      // Not loaded at all, the stub still says what was decided.
      const omitted = build([
        user("Go"),
        assistant("", { calls: [call("c1")] }),
        { ...rejected, content: "", contentOmitted: true },
      ]).messages;
      expect(omitted.at(-1)).toMatchObject({
        content: DECIDED_STUBS.rejected,
      });
    });

    it("counts tool call arguments against the window", () => {
      const { messages } = build(
        [
          user("first"),
          assistant("", { calls: [call("c1", `{"body":"${big("z")}"}`)] }),
          tool("c1", "ok"),
          assistant("done"),
          user("second"),
        ],
        { maxChars: 300 },
      );
      expect(messages).toEqual([
        { role: "system", content: SYSTEM },
        { role: "user", content: "second" },
      ]);
    });
  });
});

describe("toolRowStub", () => {
  it("says what was decided, and asks reads to be repeated", () => {
    const stub = (
      approval: TranscriptRow["approval"],
      isError = false,
      outcomeUnknown = false,
    ) => toolRowStub({ approval, isError, outcomeUnknown });
    expect(stub("approved")).toBe("Approved and done.");
    expect(stub("approved", true)).toBe("Approved; it failed.");
    expect(stub("approved", false, true)).toBe(
      "Approved; outcome unknown, check before retrying.",
    );
    expect(stub("approved", true, true)).toBe(DECIDED_STUBS.unknown);
    expect(stub("rejected")).toBe(
      "Rejected by the user. Do not retry unless asked.",
    );
    expect(stub("skipped")).toBe("Skipped.");
    expect(stub(null)).toBe(OMITTED_TOOL_RESULT);
    expect(stub(null, true)).toBe(OMITTED_TOOL_RESULT);
  });
});

describe("stubOnlyToolRows", () => {
  const sized = (
    rowId: string,
    role: SizedTranscriptRow["role"],
    contentChars: number,
    status: SizedTranscriptRow["status"] = "complete",
    approval: SizedTranscriptRow["approval"] = null,
  ): SizedTranscriptRow => ({
    id: rowId,
    role,
    status,
    approval,
    isError: false,
    contentChars,
  });

  it("picks the tool rows older than a full window", () => {
    expect(
      stubOnlyToolRows(
        [
          sized("u1", "user", 10),
          sized("a1", "assistant", 0),
          sized("t1", "tool", 500),
          sized("t-small", "tool", OMITTED_TOOL_RESULT.length),
          sized("a2", "assistant", 0),
          sized("t2", "tool", 600),
          sized("a3", "assistant", 0),
          sized("t3", "tool", 600),
        ],
        1000,
      ),
    ).toEqual(new Set(["t1"]));
  });

  it("measures a decided write against its own, shorter stub", () => {
    const skipped = DECIDED_STUBS.skipped.length;
    expect(
      stubOnlyToolRows(
        [
          sized("u1", "user", 10),
          sized("a1", "assistant", 0),
          sized("t1", "tool", skipped + 1, "complete", "skipped"),
          sized("t2", "tool", skipped, "complete", "skipped"),
          sized("t3", "tool", skipped + 1),
          sized("a2", "assistant", 0),
          sized("t4", "tool", 2000),
        ],
        1000,
      ),
    ).toEqual(new Set(["t1"]));
  });

  it("picks nothing while everything fits", () => {
    expect(
      stubOnlyToolRows(
        [
          sized("u1", "user", 10),
          sized("a1", "assistant", 0),
          sized("t1", "tool", 400),
          sized("a2", "assistant", 0),
          sized("t2", "tool", 600),
        ],
        1000,
      ).size,
    ).toBe(0);
  });

  it("doesn't count interrupted answers", () => {
    expect(
      stubOnlyToolRows(
        [
          sized("u1", "user", 10),
          sized("a1", "assistant", 0),
          sized("t1", "tool", 500),
          sized("a2", "assistant", 5000, "interrupted"),
          sized("u2", "user", 10),
        ],
        1000,
      ).size,
    ).toBe(0);
  });

  it("never picks a row buildMessages would replay whole", () => {
    const rows = [
      user("Go"),
      assistant("", { calls: [call("c1")] }),
      tool("c1", "a".repeat(300)),
      assistant("", { calls: [call("c2")] }),
      tool("c2", "b".repeat(300)),
      assistant("", { calls: [call("c3")] }),
      tool("c3", "c".repeat(300)),
      assistant("Here.", {}),
      user("And?"),
    ];
    for (const maxChars of [100, 400, 650, 700, 1000, 2000]) {
      const picked = stubOnlyToolRows(
        rows.map((row) => ({ ...row, contentChars: row.content.length })),
        maxChars,
      );
      const { replayedToolRowIds } = build(rows, { maxChars });
      for (const rowId of picked) {
        expect(replayedToolRowIds.has(rowId)).toBe(false);
      }
    }
  });
});
