import { describe, expect, it } from "vite-plus/test";
import {
  sanitizeToolCalls,
  UNNAMED_TOOL,
  uniqueToolCallId,
} from "./sanitize-tool-calls";

const call = (id: string, name: string) => ({ id, name, arguments: "{}" });

describe("sanitizeToolCalls", () => {
  it("keeps valid calls as they are", () => {
    const calls = [
      call("toolu_01AbC-def", "list_projects"),
      { ...call("call_2", "get_task"), invalid: true },
    ];
    const sanitized = sanitizeToolCalls(calls);
    expect(sanitized).toEqual(calls);
    expect(sanitized[0]).toBe(calls[0]);
  });

  it("replaces names a provider would refuse", () => {
    expect(
      sanitizeToolCalls([
        call("a", "functions.list projects"),
        call("b", "§§§"),
        call("c", "x".repeat(80)),
      ]).map((c) => c.name),
    ).toEqual(["functions_list_projects", "___", "x".repeat(64)]);
    expect(sanitizeToolCalls([call("a", "")])[0]?.name).toBe(UNNAMED_TOOL);
  });

  it("gives invalid and repeated ids fresh ones", () => {
    const [first, repeated, odd, long] = sanitizeToolCalls([
      call("call_1", "get_task"),
      call("call_1", "get_task"),
      call("call:1 ", "get_task"),
      call("y".repeat(65), "get_task"),
    ]);
    expect(first?.id).toBe("call_1");
    const fresh = [repeated?.id, odd?.id, long?.id];
    for (const id of fresh) expect(id).toMatch(/^call_[0-9a-f]{24}$/);
    expect(new Set(fresh).size).toBe(3);
  });
});

describe("uniqueToolCallId", () => {
  it("keeps an id that isn't taken", () => {
    expect(uniqueToolCallId("call_0", new Set(["call_1"]))).toBe("call_0");
  });

  it("adds the first free numbered suffix", () => {
    expect(uniqueToolCallId("call_0", new Set(["call_0"]))).toBe("call_0_2");
    expect(
      uniqueToolCallId("call_0", new Set(["call_0", "call_0_2", "call_0_3"])),
    ).toBe("call_0_4");
  });

  it("stays within 64 characters", () => {
    const long = "a".repeat(64);
    const renamed = uniqueToolCallId(long, new Set([long]));
    expect(renamed).toBe(`${"a".repeat(62)}_2`);
    expect(renamed).toHaveLength(64);
  });
});
