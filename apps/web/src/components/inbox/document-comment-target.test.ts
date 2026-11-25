import { describe, expect, it } from "vite-plus/test";
import { documentCommentTarget } from "./document-comment-target";

const eventData = {
  workspaceId: "ws1",
  projectId: "p1",
  documentTitle: "Release plan",
  threadId: "thread1",
  commentId: "reply1",
  quote: "ship by Friday",
  featureId: null,
};

describe("documentCommentTarget", () => {
  it("reads a project page and its thread", () => {
    expect(
      documentCommentTarget({
        resourceType: "project_document",
        resourceId: "doc1",
        eventData,
      }),
    ).toEqual({
      workspaceId: "ws1",
      projectId: "p1",
      documentId: "doc1",
      featureId: null,
      commentId: "thread1",
      title: "Release plan",
      quote: "ship by Friday",
    });
  });

  it("reads a Feature document with its Feature", () => {
    expect(
      documentCommentTarget({
        resourceType: "feature_document",
        resourceId: "doc2",
        eventData: { ...eventData, featureId: "feature1" },
      }),
    ).toMatchObject({ documentId: "doc2", featureId: "feature1" });
  });

  it("ignores a Feature id on a project page", () => {
    expect(
      documentCommentTarget({
        resourceType: "project_document",
        resourceId: "doc1",
        eventData: { ...eventData, featureId: "feature1" },
      })?.featureId,
    ).toBe(null);
  });

  it("has no target without the ids a link needs", () => {
    expect(
      documentCommentTarget({
        resourceType: "task",
        resourceId: "task1",
        eventData,
      }),
    ).toBe(null);
    expect(
      documentCommentTarget({
        resourceType: "project_document",
        resourceId: "doc1",
        eventData: { ...eventData, projectId: null },
      }),
    ).toBe(null);
    expect(
      documentCommentTarget({
        resourceType: "feature_document",
        resourceId: "doc2",
        eventData,
      }),
    ).toBe(null);
    expect(
      documentCommentTarget({
        resourceType: "project_document",
        resourceId: "doc1",
        eventData: "nope",
      }),
    ).toBe(null);
  });
});
