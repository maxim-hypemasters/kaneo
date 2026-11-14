import { describe, expect, it } from "vite-plus/test";
import { mergePermissions, workItemPermissions } from "./work-item-permissions";

describe("workItemPermissions", () => {
  it("checks each row type against its own resource", () => {
    expect(workItemPermissions(["bug", "feature"], "update")).toEqual({
      bug: ["update"],
      feature: ["update"],
    });
  });

  it("falls back to task when no rows were resolved", () => {
    expect(workItemPermissions([], "delete")).toEqual({ task: ["delete"] });
  });

  it("rejects types that are not work items", () => {
    expect(() => workItemPermissions(["milestone"], "read")).toThrow();
  });
});

describe("mergePermissions", () => {
  it("unions actions per resource", () => {
    expect(
      mergePermissions(
        { bug: ["update"] },
        { bug: ["create", "update"], task: ["assign"] },
        undefined,
      ),
    ).toEqual({ bug: ["update", "create"], task: ["assign"] });
  });
});
