import { describe, expect, it } from "vite-plus/test";
import {
  summarizeDocumentWrite,
  summarizeTaskDescriptionWrite,
} from "./write-summary.js";

describe("summarizeDocumentWrite", () => {
  it("keeps a project page's metadata and replaces the body with its length", () => {
    expect(
      summarizeDocumentWrite({
        id: "pg-1",
        projectId: "p-1",
        parentId: null,
        position: 2,
        title: "Plan",
        body: "a😀",
        revision: 5,
        createdBy: "u-1",
        updatedByName: "Ada",
        updatedAt: "2026-11-16T10:00:00.000Z",
      }),
    ).toEqual({
      id: "pg-1",
      projectId: "p-1",
      parentId: null,
      title: "Plan",
      revision: 5,
      updatedAt: "2026-11-16T10:00:00.000Z",
      totalLength: 3,
    });
  });

  it("keeps a Feature document's feature id", () => {
    expect(
      summarizeDocumentWrite({
        id: "d-1",
        featureId: "f-1",
        title: "Spec",
        body: "",
        revision: 1,
        updatedAt: "2026-11-16T10:00:00.000Z",
      }),
    ).toEqual({
      id: "d-1",
      featureId: "f-1",
      title: "Spec",
      revision: 1,
      updatedAt: "2026-11-16T10:00:00.000Z",
      totalLength: 0,
    });
  });

  it("passes through a response that is not an object", () => {
    expect(summarizeDocumentWrite(null)).toBeNull();
    expect(summarizeDocumentWrite("ok")).toBe("ok");
  });
});

describe("summarizeTaskDescriptionWrite", () => {
  it("drops the description and reports its length in code points", () => {
    expect(
      summarizeTaskDescriptionWrite({
        id: "t-1",
        title: "Fix login",
        description: "a😀",
        status: "to-do",
      }),
    ).toEqual({
      id: "t-1",
      title: "Fix login",
      status: "to-do",
      descriptionLength: 2,
    });
  });

  it("reports an empty or missing description as zero", () => {
    expect(
      summarizeTaskDescriptionWrite({ id: "t-1", description: null }),
    ).toEqual({ id: "t-1", descriptionLength: 0 });
    expect(summarizeTaskDescriptionWrite(undefined)).toBeUndefined();
  });
});
