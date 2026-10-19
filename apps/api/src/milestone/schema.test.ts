import { describe, expect, it } from "vite-plus/test";
import { createMilestoneBody, updateMilestoneBody } from "./schema";

describe("milestone fields", () => {
  it("trims titles and accepts nullable metadata and real calendar dates", () => {
    expect(
      createMilestoneBody.parse({
        title: "  Launch  ",
        description: null,
        endDate: "2028-02-29",
      }),
    ).toEqual({ title: "Launch", description: null, endDate: "2028-02-29" });
  });
  it.each([
    { title: " " },
    { title: "a".repeat(256) },
    { title: "Valid", description: "x".repeat(10001) },
    { title: "Valid", endDate: "2026-02-29" },
    { title: "Valid", endDate: "0000-01-01" },
    { title: "Valid", endDate: "2026-10-19T00:00:00Z" },
  ])("rejects invalid fields %o", (body) => {
    expect(createMilestoneBody.safeParse(body).success).toBe(false);
  });
  it("requires at least one patch field and supports clearing metadata", () => {
    expect(updateMilestoneBody.safeParse({}).success).toBe(false);
    expect(
      updateMilestoneBody.parse({ description: null, endDate: null }),
    ).toEqual({ description: null, endDate: null });
  });
  it("accepts independent bounds, same-day ranges and ordered intervals", () => {
    for (const dates of [
      { startDate: "2026-10-20" },
      { endDate: "2026-10-21" },
      { startDate: "2026-10-20", endDate: "2026-10-20" },
      { startDate: "2026-10-20", endDate: "2026-10-21" },
      { startDate: null, endDate: null },
    ]) {
      expect(
        createMilestoneBody.safeParse({ title: "Range", ...dates }).success,
      ).toBe(true);
      expect(updateMilestoneBody.safeParse(dates).success).toBe(true);
    }
    expect(
      createMilestoneBody.safeParse({
        title: "Range",
        startDate: "2026-10-22",
        endDate: "2026-10-21",
      }).success,
    ).toBe(false);
    expect(
      updateMilestoneBody.safeParse({
        startDate: "2026-10-22",
        endDate: "2026-10-21",
      }).success,
    ).toBe(false);
    expect(
      createMilestoneBody.safeParse({ title: "Range", startDate: "2026-02-30" })
        .success,
    ).toBe(false);
  });
  it("accepts optional existing task ids only on creation and rejects duplicates", () => {
    expect(
      createMilestoneBody.parse({ title: "Linked", taskIds: ["task", "bug"] }),
    ).toMatchObject({ taskIds: ["task", "bug"] });
    expect(
      createMilestoneBody.safeParse({
        title: "Linked",
        taskIds: ["task", "task"],
      }).success,
    ).toBe(false);
    expect(
      createMilestoneBody.safeParse({ title: "Linked", taskIds: [""] }).success,
    ).toBe(false);
    expect(
      createMilestoneBody.parse({ title: "Empty", taskIds: [] }),
    ).toMatchObject({ taskIds: [] });
    expect(updateMilestoneBody.safeParse({ taskIds: ["task"] }).success).toBe(
      false,
    );
  });
});
