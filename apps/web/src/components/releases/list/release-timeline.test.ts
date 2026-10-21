import { describe, expect, it } from "vite-plus/test";
import { releaseTimelineOrder } from "./release-timeline";

const today = "2026-10-21";
function release(
  id: string,
  startDate: string,
  submissionDate: string,
  name = id,
) {
  return {
    id,
    name,
    startDate,
    codeFreezeDate: submissionDate,
    submissionDate,
  };
}

describe("release timeline ordering", () => {
  it("places future releases above active and past releases, newest start first within each phase", () => {
    const values = [
      release("old-past", "2026-08-01", "2026-10-19"),
      release("active-old", "2026-09-01", "2026-10-23"),
      release("future-near", "2026-11-01", "2026-11-15"),
      release("recent-past", "2026-10-01", "2026-10-20"),
      release("active-new", "2026-10-10", "2026-11-05"),
      release("future-far", "2026-12-01", "2026-12-15"),
    ];
    expect(releaseTimelineOrder(values, today).map((item) => item.id)).toEqual([
      "future-far",
      "future-near",
      "active-new",
      "active-old",
      "recent-past",
      "old-past",
    ]);
    expect(values[0].id).toBe("old-past");
  });

  it("uses ascending names and IDs when start dates match", () => {
    const values = [
      release("3", "2026-11-01", "2026-11-20", "Zulu"),
      release("2", "2026-11-01", "2026-11-20", "Alpha"),
      release("1", "2026-11-01", "2026-11-20", "Alpha"),
    ];
    expect(releaseTimelineOrder(values, today).map((item) => item.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("keeps submission day active and moves it to past only on the next day", () => {
    const values = [
      release("today", "2026-10-01", today),
      release("yesterday", "2026-10-10", "2026-10-20"),
    ];
    expect(releaseTimelineOrder(values, today).map((item) => item.id)).toEqual([
      "today",
      "yesterday",
    ]);
  });
});
