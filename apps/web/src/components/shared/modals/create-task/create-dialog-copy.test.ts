import type { TFunction } from "i18next";
import { describe, expect, it } from "vite-plus/test";
import { createDialogCopy } from "./create-dialog-copy";

const t = ((key: string) => key) as unknown as TFunction;

describe("createDialogCopy", () => {
  it("names a task for tasks and a feature for features", () => {
    expect(createDialogCopy(t, "task")).toMatchObject({
      title: "common:modals.createTask.title",
      createButton: "common:modals.createTask.createButton",
      discardTitle: "common:modals.createTask.discardTitle",
    });
    expect(createDialogCopy(t, "feature")).toMatchObject({
      title: "common:modals.createTask.titleFeature",
      createButton: "common:modals.createTask.createButtonFeature",
      discardTitle: "common:modals.createTask.discardTitleFeature",
    });
  });

  it("has the same parts for both", () => {
    expect(Object.keys(createDialogCopy(t, "feature"))).toEqual(
      Object.keys(createDialogCopy(t, "task")),
    );
  });
});
