import { describe, expect, it } from "vite-plus/test";
import type { ReadReceipt } from "../message-types";
import { checkRewriteReceipt } from "./check-rewrite-receipt";

const receipt: ReadReceipt = {
  kind: "project_page",
  id: "page_1",
  version: "3",
};

const row = (
  id: string,
  readReceipts: ReadReceipt[] | null,
  role: "tool" | "assistant" = "tool",
) => ({ id, role, readReceipts });

const check = (
  transcript: ReturnType<typeof row>[],
  replayed: string[],
  overrides: Partial<Parameters<typeof checkRewriteReceipt>[0]> = {},
) =>
  checkRewriteReceipt({
    kind: "project_page",
    id: "page_1",
    currentVersion: "3",
    transcript,
    replayedToolRowIds: new Set(replayed),
    ...overrides,
  });

describe("checkRewriteReceipt", () => {
  it("passes for a replayed read of the current version", () => {
    expect(check([row("r1", [receipt])], ["r1"])).toBe(true);
  });

  it("fails without any receipt", () => {
    expect(check([row("r1", null), row("r2", [])], ["r1", "r2"])).toBe(false);
  });

  it("fails when the read was stubbed out of the window", () => {
    expect(check([row("r1", [receipt])], [])).toBe(false);
  });

  it("fails for an older version", () => {
    expect(check([row("r1", [receipt])], ["r1"], { currentVersion: "4" })).toBe(
      false,
    );
  });

  it("fails for another document or kind", () => {
    expect(check([row("r1", [receipt])], ["r1"], { id: "page_2" })).toBe(false);
    expect(
      check([row("r1", [receipt])], ["r1"], { kind: "feature_document" }),
    ).toBe(false);
  });

  it("ignores receipts on rows that are not tool rows", () => {
    expect(check([row("a1", [receipt], "assistant")], ["a1"])).toBe(false);
  });

  it("finds the receipt among several reads", () => {
    const old = { ...receipt, version: "2" };
    expect(check([row("r1", [old]), row("r2", [receipt])], ["r1", "r2"])).toBe(
      true,
    );
  });
});
