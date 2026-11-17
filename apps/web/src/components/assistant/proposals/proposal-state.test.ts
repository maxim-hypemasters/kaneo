import { describe, expect, it } from "vite-plus/test";
import {
  mayHaveWritten,
  OUTCOME_UNKNOWN_ERROR,
  proposalState,
} from "./proposal-state";

const row = (overrides: Partial<Parameters<typeof proposalState>[0]> = {}) => ({
  approval: "pending" as const,
  isError: false,
  errorText: null,
  resultSummary: null,
  ...overrides,
});

describe("proposalState", () => {
  it.each([
    [row(), "pending"],
    [row({ approval: "rejected" }), "rejected"],
    [row({ approval: "skipped" }), "skipped"],
    [
      row({
        approval: "approved",
        resultSummary: { label: "Created KAN-1 Fix", href: "/acme/task/KAN-1" },
      }),
      "succeeded",
    ],
    [
      row({ approval: "approved", isError: true, errorText: "Forbidden" }),
      "failed",
    ],
    [
      row({
        approval: "approved",
        isError: true,
        errorText: OUTCOME_UNKNOWN_ERROR,
      }),
      "unknown",
    ],
    // The server stopped between claiming and saving the result.
    [row({ approval: "approved" }), "unknown"],
  ] as const)("reads %o as %s", (input, state) => {
    expect(proposalState(input)).toBe(state);
  });

  it("treats only run or unknown changes as possible writes", () => {
    expect(
      mayHaveWritten(
        row({
          approval: "approved",
          resultSummary: { label: "Done", href: null },
        }),
      ),
    ).toBe(true);
    expect(mayHaveWritten(row({ approval: "approved" }))).toBe(true);
    expect(
      mayHaveWritten(
        row({ approval: "approved", isError: true, errorText: "Not found" }),
      ),
    ).toBe(false);
    expect(mayHaveWritten(row({ approval: "rejected" }))).toBe(false);
    expect(mayHaveWritten(row())).toBe(false);
  });
});
