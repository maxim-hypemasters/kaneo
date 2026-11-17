import { describe, expect, it } from "vite-plus/test";
import { planningKeyChange } from "./planning-key";
import type { TimeOffSnapshot } from "./schedule-refresh-needed";

const today = "2026-11-14";
const range = (
  status: TimeOffSnapshot["status"],
  startDate = "2026-11-16",
  endDate = "2026-11-20",
): TimeOffSnapshot => ({ status, startDate, endDate });

describe("planningKeyChange", () => {
  it("keys approved days a plan may still use", () => {
    expect(
      planningKeyChange("off-1", range("pending"), range("approved"), today),
    ).toEqual({ planningKey: "off-1:2026-11-16:2026-11-20" });
    expect(
      planningKeyChange(
        "off-1",
        range("approved"),
        range("approved", "2026-11-16", "2026-11-18"),
        today,
      ),
    ).toEqual({ planningKey: "off-1:2026-11-16:2026-11-18" });
  });

  it("clears the key when upcoming approved time off is cancelled", () => {
    expect(
      planningKeyChange("off-1", range("approved"), range("cancelled"), today),
    ).toEqual({ planningKey: null });
  });

  it("keeps the stored key for changes plans can't notice", () => {
    const past = (status: TimeOffSnapshot["status"], endDate = "2026-01-09") =>
      range(status, "2026-01-05", endDate);
    // Approved after it ended, then cancelled or re-dated in the past.
    expect(
      planningKeyChange("off-1", past("pending"), past("approved"), today),
    ).toEqual({});
    expect(
      planningKeyChange("off-1", past("approved"), past("cancelled"), today),
    ).toEqual({});
    expect(
      planningKeyChange(
        "off-1",
        past("approved"),
        past("approved", "2026-01-07"),
        today,
      ),
    ).toEqual({});
    // Pending changes never reach plans.
    expect(planningKeyChange("off-1", null, range("pending"), today)).toEqual(
      {},
    );
    expect(
      planningKeyChange("off-1", range("pending"), range("cancelled"), today),
    ).toEqual({});
  });
});
