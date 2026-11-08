import type { TFunction } from "i18next";
import { describe, expect, it } from "vite-plus/test";
import { taskWindowCopy } from "./task-window-copy";

const t = ((key: string) => key) as unknown as TFunction;

describe("taskWindowCopy", () => {
  it("keeps the task words for Tasks and Bugs", () => {
    expect(taskWindowCopy(t, false)).toMatchObject({
      copyLink: "tasks:properties.copyTaskLink",
      copyId: "navigation:shortcuts.items.copyTaskId",
      delete: "tasks:delete.action",
      deleteDescription: "tasks:delete.description",
      moved: "tasks:move.success",
      loading: "tasks:common.loadingTask",
    });
  });

  it("names a feature for Features", () => {
    const copy = taskWindowCopy(t, true);
    expect(copy).toMatchObject({
      copyLink: "tasks:features.window.copyLink",
      copyId: "tasks:features.window.copyId",
      delete: "tasks:features.window.delete",
      deleteDescription: "tasks:features.window.deleteDescription",
      moved: "tasks:features.window.moved",
      loading: "tasks:features.window.loading",
    });
    for (const label of Object.values(copy))
      expect(label).toMatch(/^tasks:features\.window\./);
  });

  it("has the same parts for both", () => {
    expect(Object.keys(taskWindowCopy(t, true))).toEqual(
      Object.keys(taskWindowCopy(t, false)),
    );
  });
});
