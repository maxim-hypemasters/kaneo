import { describe, expect, it } from "vite-plus/test";
import type { AssistantProposalPreview } from "../message-types";
import {
  freeTextChanged,
  freeTextGuard,
  readFreeText,
} from "./free-text-guards";

const preview = (
  fields: AssistantProposalPreview["fields"],
): AssistantProposalPreview => ({
  target: "Mobile",
  targetKey: "projectId",
  fields,
  diff: null,
  nested: null,
});

describe("freeTextGuard", () => {
  it("re-reads a project's previewed name and description", () => {
    expect(
      freeTextGuard(
        "update_project_details",
        { projectId: "p1", description: "New" },
        preview([
          { key: "projectId", kind: "ref", value: "Mobile" },
          { key: "description", kind: "markdown", value: "New", from: null },
        ]),
      ),
    ).toEqual({
      path: "/api/project/p1",
      expected: [{ key: "description", from: null }],
    });
  });

  it("guards milestone, release and task titles", () => {
    const titled = preview([
      { key: "title", kind: "text", value: "B", from: "A" },
      { key: "name", kind: "text", value: "B", from: "A" },
      { key: "priority", kind: "text", value: "high", from: "low" },
    ]);
    expect(
      freeTextGuard("update_milestone", { milestoneId: "m1" }, titled),
    ).toEqual({
      path: "/api/milestone/m1",
      expected: [{ key: "title", from: "A" }],
    });
    expect(
      freeTextGuard("update_release", { releaseId: "r1" }, titled),
    ).toEqual({
      path: "/api/release/r1",
      expected: [{ key: "name", from: "A" }],
    });
    expect(freeTextGuard("update_task", { taskId: "t1" }, titled)).toEqual({
      path: "/api/task/t1",
      expected: [{ key: "title", from: "A" }],
    });
  });

  it("guards page and Feature document titles", () => {
    const renamed = preview([
      { key: "title", kind: "text", value: "B", from: "A" },
      { key: "appendMarkdown", kind: "markdown", value: "More" },
    ]);
    expect(
      freeTextGuard("update_project_page", { pageId: "d1" }, renamed),
    ).toEqual({
      path: "/api/project-document/d1",
      expected: [{ key: "title", from: "A" }],
    });
    expect(
      freeTextGuard(
        "update_feature_document",
        { featureId: "f1", documentId: "d2" },
        renamed,
      ),
    ).toEqual({
      path: "/api/feature/f1/documents/d2",
      expected: [{ key: "title", from: "A" }],
    });
  });

  it("needs nothing for other updates or fields without a previous value", () => {
    expect(
      freeTextGuard(
        "update_task_status",
        { taskId: "t1" },
        preview([
          { key: "status", kind: "text", value: "done", from: "to-do" },
        ]),
      ),
    ).toBeNull();
    expect(
      freeTextGuard(
        "update_task",
        { taskId: "t1" },
        preview([{ key: "title", kind: "text", value: "B" }]),
      ),
    ).toBeNull();
    expect(freeTextGuard("update_task", { taskId: "t1" }, null)).toBeNull();
  });
});

describe("freeTextChanged", () => {
  const guard = {
    path: "/api/project/p1",
    expected: [
      { key: "name", from: "Mobile" },
      { key: "description", from: null },
    ],
  };

  it("passes while the text is what the card showed", () => {
    expect(freeTextChanged(guard, { name: "Mobile", description: null })).toBe(
      false,
    );
    // An empty description reads the same as none.
    expect(freeTextChanged(guard, { name: "Mobile", description: "" })).toBe(
      false,
    );
  });

  it("fails when any guarded field changed", () => {
    expect(
      freeTextChanged(guard, { name: "Mobile app", description: null }),
    ).toBe(true);
    expect(
      freeTextChanged(guard, { name: "Mobile", description: "Edited" }),
    ).toBe(true);
  });
});

describe("readFreeText", () => {
  it("reads strings and treats anything else as empty", () => {
    expect(readFreeText("x")).toBe("x");
    expect(readFreeText(null)).toBeNull();
    expect(readFreeText(undefined)).toBeNull();
    expect(readFreeText(3)).toBeNull();
  });
});
