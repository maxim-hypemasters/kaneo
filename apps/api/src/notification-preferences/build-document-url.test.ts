import { describe, expect, it } from "vite-plus/test";
import { buildDocumentUrl } from "./build-document-url";

describe("buildDocumentUrl", () => {
  it("opens a project page on its comment thread", () => {
    expect(
      buildDocumentUrl("https://kaneo.example", {
        workspaceId: "ws1",
        projectId: "p1",
        documentId: "doc1",
        featureId: null,
        threadId: "thread1",
      }),
    ).toBe(
      "https://kaneo.example/dashboard/workspace/ws1/project/p1?tab=documents&documentId=doc1&commentId=thread1",
    );
  });

  it("names the Feature of a Feature document", () => {
    expect(
      buildDocumentUrl("https://kaneo.example", {
        workspaceId: "ws1",
        projectId: "p1",
        documentId: "doc1",
        featureId: "feature1",
        threadId: "thread1",
      }),
    ).toBe(
      "https://kaneo.example/dashboard/workspace/ws1/project/p1?tab=documents&documentId=doc1&documentFeatureId=feature1&commentId=thread1",
    );
  });

  it("opens the document alone without a thread", () => {
    expect(
      buildDocumentUrl("https://kaneo.example", {
        workspaceId: "ws1",
        projectId: "p1",
        documentId: "doc1",
        featureId: null,
        threadId: null,
      }),
    ).toBe(
      "https://kaneo.example/dashboard/workspace/ws1/project/p1?tab=documents&documentId=doc1",
    );
  });
});
