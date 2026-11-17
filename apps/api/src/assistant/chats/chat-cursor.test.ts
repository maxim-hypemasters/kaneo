import { describe, expect, it } from "vite-plus/test";
import { decodeChatCursor, encodeChatCursor } from "./chat-cursor";

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("chat cursor", () => {
  it("round-trips a cursor with microseconds", () => {
    const cursor = {
      updatedAt: "2026-11-16T10:00:00.123456",
      id: "ckz8f0k3a0000xyz",
    };
    const encoded = encodeChatCursor(cursor);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeChatCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ["not base64 json", "%%%"],
    ["an object", encode({ updatedAt: "2026-11-16T10:00:00.123456", id: "a" })],
    ["a missing id", encode(["2026-11-16T10:00:00.123456"])],
    ["milliseconds only", encode(["2026-11-16T10:00:00.123", "a"])],
    ["a time zone suffix", encode(["2026-11-16T10:00:00.123456Z", "a"])],
    ["an impossible date", encode(["2026-02-30T10:00:00.000000", "a"])],
    ["an impossible hour", encode(["2026-11-16T25:00:00.000000", "a"])],
    ["an id with SQL", encode(["2026-11-16T10:00:00.000000", "a' or 1=1"])],
    ["an empty id", encode(["2026-11-16T10:00:00.000000", ""])],
    ["a numeric id", encode(["2026-11-16T10:00:00.000000", 5])],
  ])("rejects %s", (_label, value) => {
    expect(decodeChatCursor(value)).toBeNull();
  });
});
