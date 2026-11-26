import { describe, expect, it } from "vite-plus/test";
import type { ProjectDocumentTree } from "@/fetchers/project-document/types";
import { withDocumentTitle } from "./with-document-title";

const tree: ProjectDocumentTree = {
  pages: [
    {
      id: "page",
      parentId: null,
      position: 0,
      title: "Untitled",
      updatedByName: "Ada",
      updatedAt: "2026-11-26T10:00:00Z",
    },
  ],
  features: [
    {
      id: "feature",
      number: 1,
      title: "Search",
      documents: [
        { id: "doc", title: "Design", updatedAt: "2026-11-26T10:00:00Z" },
      ],
    },
  ],
};

describe("withDocumentTitle", () => {
  it("renames a page", () => {
    const next = withDocumentTitle(tree, "page", "Launch");
    expect(next.pages[0]?.title).toBe("Launch");
    expect(next.features).toBe(tree.features);
  });

  it("renames a Feature document", () => {
    const next = withDocumentTitle(tree, "doc", "Search design");
    expect(next.features[0]?.documents[0]?.title).toBe("Search design");
    expect(next.pages).toBe(tree.pages);
  });

  it("returns the same tree when nothing changes", () => {
    expect(withDocumentTitle(tree, "page", "Untitled")).toBe(tree);
    expect(withDocumentTitle(tree, "doc", "Design")).toBe(tree);
    expect(withDocumentTitle(tree, "missing", "Anything")).toBe(tree);
  });
});
