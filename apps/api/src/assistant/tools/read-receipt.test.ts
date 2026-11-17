import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { extractReadReceipt, taskDescriptionVersion } from "./read-receipt";

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

const page = {
  id: "p1",
  title: "Plan",
  revision: 4,
  body: "# Plan",
  offset: 0,
  totalLength: 6,
  truncated: false,
  nextOffset: null,
};

describe("extractReadReceipt", () => {
  it("records a whole project page at its revision", () => {
    expect(
      extractReadReceipt("get_project_page", { pageId: "p1" }, page, true),
    ).toEqual({ kind: "project_page", id: "p1", version: "4" });
    expect(
      extractReadReceipt(
        "get_project_page",
        { pageId: "p1", offset: 0, maxChars: 30_000 },
        page,
        true,
      ),
    ).not.toBeNull();
  });

  it("records a whole Feature document by its document id", () => {
    expect(
      extractReadReceipt(
        "get_feature_document",
        { featureId: "f1", documentId: "d1" },
        { ...page, id: "d1", featureId: "f1" },
        true,
      ),
    ).toEqual({ kind: "feature_document", id: "d1", version: "4" });
  });

  it("gives no receipt for a partial or cut document", () => {
    const args = { pageId: "p1" };
    for (const [result, complete, readArgs] of [
      [page, false, args],
      [{ ...page, truncated: true, nextOffset: 6 }, true, args],
      [{ ...page, offset: 10 }, true, { pageId: "p1", offset: 10 }],
      [{ ...page, revision: undefined }, true, args],
      [{ ...page, id: "other" }, true, args],
      [{ error: "Not found" }, true, args],
    ] as const)
      expect(
        extractReadReceipt("get_project_page", readArgs, result, complete),
      ).toBeNull();
  });

  it("hashes a whole task description from get_task_description", () => {
    const description = "Steps:\n1. Open the app 😀";
    expect(
      extractReadReceipt(
        "get_task_description",
        { taskId: "t1" },
        {
          taskId: "t1",
          offset: 0,
          content: description,
          version: "123",
          nextOffset: null,
          truncated: false,
          totalLength: 24,
        },
        true,
      ),
    ).toEqual({
      kind: "task_description",
      id: "t1",
      version: sha256(description),
    });
    expect(
      extractReadReceipt(
        "get_task_description",
        { taskId: "t1" },
        { taskId: "t1", offset: 0, content: "x", truncated: true },
        true,
      ),
    ).toBeNull();
  });

  it("hashes a complete description from get_task", () => {
    expect(
      extractReadReceipt(
        "get_task",
        { taskId: "t1" },
        { id: "t1", title: "Bug", description: "Fix it" },
        true,
      ),
    ).toEqual({
      kind: "task_description",
      id: "t1",
      version: sha256("Fix it"),
    });
    // A null description is the empty one the API compares against.
    expect(
      extractReadReceipt(
        "get_task",
        { taskId: "t1" },
        { id: "t1", description: null },
        true,
      )?.version,
    ).toBe(sha256(""));
    expect(
      extractReadReceipt(
        "get_task",
        { taskId: "t1" },
        { id: "t1", description: "Fix it" },
        false,
      ),
    ).toBeNull();
    expect(
      extractReadReceipt(
        "get_task",
        { taskId: "t1" },
        { id: "t1", description: null, descriptionDeferred: true },
        true,
      ),
    ).toBeNull();
  });

  it("ignores every other tool", () => {
    expect(
      extractReadReceipt("list_project_pages", { projectId: "p" }, page, true),
    ).toBeNull();
  });
});

describe("taskDescriptionVersion", () => {
  it("is the sha256 hex of the description, with null as empty", () => {
    expect(taskDescriptionVersion("abc")).toBe(sha256("abc"));
    expect(taskDescriptionVersion(null)).toBe(taskDescriptionVersion(""));
  });
});
