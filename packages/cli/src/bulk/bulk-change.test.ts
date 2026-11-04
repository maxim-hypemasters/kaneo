import { Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { type BulkFlags, parseBulkChange } from "./bulk-change.js";

const none: BulkFlags = {
  status: Option.none(),
  priority: Option.none(),
  assignee: Option.none(),
  unassign: false,
  estimateSeconds: Option.none(),
  addLabel: Option.none(),
  removeLabel: Option.none(),
  delete: false,
};

const now = new Date(2026, 9, 8, 15);

describe("parseBulkChange", () => {
  it("needs exactly one change", () => {
    const empty = parseBulkChange(none, now);
    expect(Result.isFailure(empty) && empty.failure.message).toBe(
      "Nothing to change.",
    );
    const two = parseBulkChange(
      { ...none, status: Option.some("done"), delete: true },
      now,
    );
    expect(Result.isFailure(two) && two.failure.message).toBe(
      "Pass one change per call, not --status and --delete.",
    );
  });

  it("maps each flag to its change", () => {
    expect(
      Result.getOrThrow(
        parseBulkChange({ ...none, status: Option.some(" done ") }, now),
      ),
    ).toEqual({ kind: "status", reference: "done" });
    expect(
      Result.getOrThrow(
        parseBulkChange({ ...none, priority: Option.some("urgent") }, now),
      ),
    ).toEqual({ kind: "priority", priority: "urgent" });
    expect(
      Result.getOrThrow(parseBulkChange({ ...none, unassign: true }, now)),
    ).toEqual({ kind: "unassign" });
    expect(
      Result.getOrThrow(
        parseBulkChange({ ...none, addLabel: Option.some("Bug") }, now),
      ),
    ).toEqual({ kind: "addLabel", name: "Bug" });
    expect(
      Result.getOrThrow(
        parseBulkChange({ ...none, removeLabel: Option.some("Bug") }, now),
      ),
    ).toEqual({ kind: "removeLabel", name: "Bug" });
    expect(
      Result.getOrThrow(parseBulkChange({ ...none, delete: true }, now)),
    ).toEqual({ kind: "delete" });
  });

  it("parses canonical estimates and none to clear", () => {
    expect(
      Result.getOrThrow(
        parseBulkChange({ ...none, estimateSeconds: Option.some("5400") }, now),
      ),
    ).toEqual({ kind: "estimate", estimateSeconds: 5400 });
    expect(
      Result.getOrThrow(
        parseBulkChange({ ...none, estimateSeconds: Option.some("none") }, now),
      ),
    ).toEqual({ kind: "estimate", estimateSeconds: null });
    expect(
      Result.isFailure(
        parseBulkChange({ ...none, estimateSeconds: Option.some("soon") }, now),
      ),
    ).toBe(true);
  });

  it("refuses empty values", () => {
    expect(
      Result.isFailure(
        parseBulkChange({ ...none, assignee: Option.some(" ") }, now),
      ),
    ).toBe(true);
  });
});
