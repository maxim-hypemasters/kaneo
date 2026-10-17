import { describe, expect, it } from "vite-plus/test";
import { redactedActivityScore } from "./redacted-activity-score";

const row = (
  overrides: Partial<Parameters<typeof redactedActivityScore>[0]>,
) => ({
  content: null,
  eventData: { newFeatureId: "f1", newFeatureTitle: null },
  taskTitle: "Write invoices",
  ...overrides,
});

describe("redactedActivityScore", () => {
  it("drops a row only its hidden text matched", () => {
    expect(redactedActivityScore(row({}), "Contoso", 2)).toBeNull();
  });

  it("keeps a row the redacted text still matches", () => {
    expect(
      redactedActivityScore(
        row({ eventData: { toProjectName: "Contoso Beta" } }),
        "contoso",
        2,
      ),
    ).toBe(2);
  });

  it("ranks a row matched only by its task's title as a title match", () => {
    expect(redactedActivityScore(row({}), "INVOICES", 2)).toBe(1);
  });

  it("keeps a row matched on its content, which redaction leaves alone", () => {
    expect(
      redactedActivityScore(row({ content: "a note" }), "Contoso", 2),
    ).toBe(2);
  });
});
