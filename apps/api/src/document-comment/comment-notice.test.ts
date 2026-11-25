import { describe, expect, it } from "vite-plus/test";
import { commentNotice } from "./comment-notice";

const scope = {
  documentId: "doc",
  projectId: "project",
  workspaceId: "workspace",
  userId: "author",
};

describe("commentNotice", () => {
  it("describes a new thread on a page", () => {
    expect(
      commentNotice(
        { ...scope, kind: "page" },
        "Handbook",
        { id: "thread", parentId: null, content: "Is this right?" },
        "quoted",
      ),
    ).toEqual({
      comment: {
        id: "thread",
        parentId: null,
        userId: "author",
        content: "Is this right?",
      },
      quote: "quoted",
      document: { kind: "page", id: "doc", title: "Handbook" },
      projectId: "project",
      workspaceId: "workspace",
    });
  });

  it("names the Feature of a Feature document and passes only the comment's own fields", () => {
    const reply = {
      id: "reply",
      parentId: "thread",
      content: "Yes",
      userName: "Someone",
      editedAt: null,
    };
    expect(
      commentNotice(
        { ...scope, kind: "feature", featureId: "feature" },
        "Spec",
        reply,
        "quoted",
      ),
    ).toEqual({
      comment: {
        id: "reply",
        parentId: "thread",
        userId: "author",
        content: "Yes",
      },
      quote: "quoted",
      document: {
        kind: "feature",
        id: "doc",
        title: "Spec",
        featureId: "feature",
      },
      projectId: "project",
      workspaceId: "workspace",
    });
  });
});
