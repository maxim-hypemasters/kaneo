import { describe, expect, it } from "vite-plus/test";
import { parseAssistantStreamEvent } from "./parse-assistant-stream-event";

describe("parseAssistantStreamEvent", () => {
  it("reads every event type", () => {
    expect(
      parseAssistantStreamEvent(
        '{"type":"chat","chat":{"id":"c1","title":"Hi"}}',
      ),
    ).toEqual({ type: "chat", chat: { id: "c1", title: "Hi" } });
    expect(parseAssistantStreamEvent('{"type":"delta","text":"Hel"}')).toEqual({
      type: "delta",
      text: "Hel",
    });
    expect(
      parseAssistantStreamEvent(
        '{"type":"message","message":{"id":"m1","role":"user","content":"x"}}',
      ),
    ).toMatchObject({ type: "message", message: { id: "m1", role: "user" } });
    expect(
      parseAssistantStreamEvent(
        '{"type":"error","code":"OPENROUTER_CREDITS","retryable":false}',
      ),
    ).toEqual({ type: "error", code: "OPENROUTER_CREDITS", retryable: false });
    expect(
      parseAssistantStreamEvent(
        '{"type":"done","pendingCount":0,"truncated":true}',
      ),
    ).toEqual({ type: "done", pendingCount: 0, truncated: true });
  });

  it("skips unknown types and malformed payloads", () => {
    for (const data of [
      '{"type":"reasoning","text":"secret"}',
      '{"type":"delta"}',
      '{"type":"message","message":{"content":"no id"}}',
      '{"type":"chat"}',
      "not json",
      "[1,2]",
      "null",
      "",
    ]) {
      expect(parseAssistantStreamEvent(data)).toBeNull();
    }
  });

  it("ends the turn as an internal error on an unknown error code", () => {
    for (const code of ["NEW_THING", "toString"]) {
      expect(
        parseAssistantStreamEvent(`{"type":"error","code":"${code}"}`),
      ).toEqual({
        type: "error",
        code: "ASSISTANT_INTERNAL",
        retryable: false,
      });
    }
  });
});
