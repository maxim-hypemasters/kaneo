import { describe, expect, it } from "vite-plus/test";
import { assessState } from "./assess-state";

const configured = { configured: true };

describe("assessState", () => {
  it("reports a missing runner before any queued check", () => {
    expect(
      assessState({ assessing: true, runner: { configured: false } }, false),
    ).toBe("runnerMissing");
    expect(
      assessState({ assessing: false, runner: { configured: false } }, false),
    ).toBe("runnerMissing");
  });

  it("tells a check waiting out the edit window from a running one", () => {
    expect(assessState({ assessing: true, runner: configured }, true)).toBe(
      "scheduled",
    );
    expect(assessState({ assessing: true, runner: configured }, false)).toBe(
      "assessing",
    );
  });

  it("is idle when no check is waiting", () => {
    expect(assessState({ assessing: false, runner: configured }, true)).toBe(
      "idle",
    );
  });
});
