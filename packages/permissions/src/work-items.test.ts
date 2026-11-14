import { describe, expect, it } from "vite-plus/test";
import { statement } from "./index";
import { isWorkItemType, WORK_ITEM_TYPES } from "./work-items";

describe("work item types", () => {
  it("names a permission resource for every task row type", () => {
    for (const type of WORK_ITEM_TYPES) {
      expect(statement[type]).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    }
  });

  it("accepts only known task row types", () => {
    expect(isWorkItemType("bug")).toBe(true);
    expect(isWorkItemType("milestone")).toBe(false);
    expect(isWorkItemType(undefined)).toBe(false);
  });
});
