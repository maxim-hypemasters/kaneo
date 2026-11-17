import { describe, expect, it } from "vite-plus/test";
import { updateDocumentBody } from "./update-document-body.js";

const options = { noun: "page", maxBody: 20 };
const current = { body: "First.", revision: 4 };

describe("updateDocumentBody", () => {
  it("replaces the body at the caller's revision without reading", () => {
    expect(
      updateDocumentBody({ body: "New", expectedRevision: 3 }, null, options),
    ).toEqual({
      status: "ready",
      put: { body: "New", expectedRevision: 3, keepRemovedAssets: true },
    });
  });

  it("renames at the caller's revision without reading", () => {
    expect(
      updateDocumentBody(
        { title: "Renamed", expectedRevision: 3 },
        null,
        options,
      ),
    ).toEqual({
      status: "ready",
      put: { title: "Renamed", expectedRevision: 3, keepRemovedAssets: true },
    });
  });

  it("asks for the current document to rename without a revision", () => {
    const edit = { title: "Renamed" };
    expect(updateDocumentBody(edit, null, options)).toEqual({
      status: "needs-current",
    });
    expect(updateDocumentBody(edit, current, options)).toEqual({
      status: "ready",
      put: { title: "Renamed", expectedRevision: 4, keepRemovedAssets: true },
    });
  });

  it("appends to the current body at the current revision", () => {
    const edit = { appendMarkdown: "- Second" };
    expect(updateDocumentBody(edit, null, options)).toEqual({
      status: "needs-current",
    });
    expect(updateDocumentBody(edit, current, options)).toEqual({
      status: "ready",
      put: {
        body: "First.\n\n- Second",
        expectedRevision: 4,
        keepRemovedAssets: true,
      },
    });
  });

  it("appends against the caller's revision when given", () => {
    const edit = {
      title: "Renamed",
      appendMarkdown: "More",
      expectedRevision: 3,
    };
    expect(updateDocumentBody(edit, null, options)).toEqual({
      status: "needs-current",
    });
    expect(updateDocumentBody(edit, current, options)).toEqual({
      status: "ready",
      put: {
        title: "Renamed",
        body: "First.\n\nMore",
        expectedRevision: 3,
        keepRemovedAssets: true,
      },
    });
  });

  it.each([
    [{}, "Send title, body or appendMarkdown."],
    [
      { body: "New", appendMarkdown: "More", expectedRevision: 4 },
      "Send body or appendMarkdown, not both.",
    ],
    [
      { body: "New" },
      "Replacing the body needs expectedRevision. Read the whole page first, or use appendMarkdown.",
    ],
  ])("refuses %j before reading", (edit, error) => {
    expect(updateDocumentBody(edit, null, options)).toEqual({
      status: "invalid",
      error,
    });
  });

  it("refuses an append that would make the body too long", () => {
    expect(
      updateDocumentBody({ appendMarkdown: "x".repeat(13) }, current, {
        noun: "document",
        maxBody: 20,
      }),
    ).toEqual({
      status: "invalid",
      error: "The document body would exceed 20 characters.",
    });
    expect(
      updateDocumentBody({ appendMarkdown: "x".repeat(12) }, current, options)
        .status,
    ).toBe("ready");
  });
});
