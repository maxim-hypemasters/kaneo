import { describe, expect, it } from "vite-plus/test";
import { REWRITE_MAX_CHARS } from "../constants";
import type { ReadReceipt } from "../message-types";
import { taskDescriptionVersion } from "../tools/read-receipt";
import {
  type CurrentDocument,
  currentDocumentOf,
  planDocumentEdit,
  withExpectationPlaceholder,
} from "./document-edit";

const page: CurrentDocument = {
  body: "# Old\n\nText",
  version: "3",
  expectation: 3,
};

const proposal = (receipts: ReadReceipt[], replayed = true) => ({
  transcript: [
    {
      id: "read_1",
      role: "tool" as const,
      readReceipts: receipts,
    },
  ] as never,
  replayedToolRowIds: new Set(replayed ? ["read_1"] : []),
});
const pageReceipt: ReadReceipt = {
  kind: "project_page",
  id: "page_1",
  version: "3",
};

describe("withExpectationPlaceholder", () => {
  it("adds a stand-in expectation to a full replace", () => {
    expect(
      withExpectationPlaceholder("update_project_page", {
        pageId: "p",
        body: "x",
      }),
    ).toEqual({ pageId: "p", body: "x", expectedRevision: 1 });
    expect(
      withExpectationPlaceholder("update_task_description", {
        taskId: "t",
        description: "x",
      }),
    ).toEqual({ taskId: "t", description: "x", expectedDescription: "" });
  });

  it("leaves appends, renames and other tools as they are", () => {
    for (const [tool, args] of [
      ["update_project_page", { pageId: "p", appendMarkdown: "x" }],
      ["update_feature_document", { documentId: "d", title: "x" }],
      ["update_task_description", { taskId: "t", appendMarkdown: "x" }],
      ["update_task", { taskId: "t", title: "x" }],
    ] as const)
      expect(withExpectationPlaceholder(tool, args)).toBe(args);
  });
});

describe("currentDocumentOf", () => {
  it("reads a page's body and revision", () => {
    expect(
      currentDocumentOf("update_project_page", { body: "Hi", revision: 4 }),
    ).toEqual({ body: "Hi", version: "4", expectation: 4 });
    expect(currentDocumentOf("update_project_page", { body: "Hi" })).toBeNull();
  });

  it("reads a task description and its hash", () => {
    expect(
      currentDocumentOf("update_task_description", { description: null }),
    ).toEqual({
      body: "",
      version: taskDescriptionVersion(null),
      expectation: "",
    });
    expect(
      currentDocumentOf("update_task_description", { description: "Steps" }),
    ).toEqual({
      body: "Steps",
      version: taskDescriptionVersion("Steps"),
      expectation: "Steps",
    });
  });

  it("is null for other tools", () => {
    expect(currentDocumentOf("update_task", { description: "x" })).toBeNull();
  });
});

describe("planDocumentEdit", () => {
  const plan = (
    args: Record<string, unknown>,
    receipts: ReadReceipt[] = [pageReceipt],
    replayed = true,
    toolName = "update_project_page",
    current = page,
  ) =>
    planDocumentEdit({
      toolName,
      args,
      current,
      proposal: proposal(receipts, replayed),
    });

  it("accepts a rewrite of the version the model read in full", () => {
    expect(
      plan({ pageId: "page_1", body: "# New", expectedRevision: 1 }),
    ).toEqual({
      ok: true,
      diff: { before: "# Old\n\nText", after: "# New" },
      args: { pageId: "page_1", body: "# New", expectedRevision: 3 },
    });
  });

  it("refuses a rewrite without a full read of the current version", () => {
    for (const result of [
      plan({ pageId: "page_1", body: "x" }, []),
      plan({ pageId: "page_1", body: "x" }, [pageReceipt], false),
      plan({ pageId: "page_1", body: "x" }, [{ ...pageReceipt, version: "2" }]),
    ]) {
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining(
          "Read the full current text with get_project_page first, or use appendMarkdown",
        ),
      });
    }
  });

  it("refuses a rewrite longer than the limit", () => {
    expect(
      plan({ pageId: "page_1", body: "x".repeat(REWRITE_MAX_CHARS + 1) }),
    ).toEqual({
      ok: false,
      error: expect.stringContaining("too long to propose as a rewrite"),
    });
  });

  it("refuses a rewrite and an append together", () => {
    expect(plan({ pageId: "page_1", body: "x", appendMarkdown: "y" })).toEqual({
      ok: false,
      error: expect.stringContaining("not both"),
    });
  });

  it("previews an append and leaves the revision to the run", () => {
    expect(
      plan(
        { pageId: "page_1", appendMarkdown: "  More  ", expectedRevision: 1 },
        [],
      ),
    ).toEqual({
      ok: true,
      diff: { before: "# Old\n\nText", after: "# Old\n\nText\n\nMore" },
      args: { pageId: "page_1", appendMarkdown: "  More  " },
    });
  });

  it("needs no diff for a rename", () => {
    expect(plan({ pageId: "page_1", title: "New" }, [])).toEqual({
      ok: true,
      diff: null,
      args: { pageId: "page_1", title: "New" },
    });
  });

  it("injects the current description into a task rewrite", () => {
    const description = { body: "Old", version: "h1", expectation: "Old" };
    expect(
      plan(
        { taskId: "task_1", description: "New", expectedDescription: "" },
        [{ kind: "task_description", id: "task_1", version: "h1" }],
        true,
        "update_task_description",
        description,
      ),
    ).toEqual({
      ok: true,
      diff: { before: "Old", after: "New" },
      args: {
        taskId: "task_1",
        description: "New",
        expectedDescription: "Old",
      },
    });
  });

  it("leaves other tools alone", () => {
    expect(plan({ taskId: "t", title: "x" }, [], true, "update_task")).toEqual({
      ok: true,
      diff: null,
      args: { taskId: "t", title: "x" },
    });
  });
});
