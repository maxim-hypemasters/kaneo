import { describe, expect, it } from "vite-plus/test";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import { withAnchors, withoutComment, withThread } from "./thread-cache";

function thread(
  id: string,
  overrides: Partial<DocumentCommentThread> = {},
): DocumentCommentThread {
  return {
    id,
    parentId: null,
    userId: "user-1",
    userName: "Ana",
    userImage: null,
    content: "Comment",
    createdAt: "2026-11-20T10:00:00.000Z",
    editedAt: null,
    anchor: { quote: "quoted", prefix: "before", suffix: "after" },
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    replies: [],
    ...overrides,
  };
}

function reply(id: string, parentId: string) {
  const {
    anchor: _a,
    resolvedAt: _b,
    resolvedBy: _c,
    resolvedByName: _d,
    replies: _e,
    ...comment
  } = thread(id);
  return { ...comment, parentId };
}

describe("withThread", () => {
  it("adds a new thread after the others", () => {
    expect(
      withThread([thread("a")], thread("b")).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });

  it("replaces a thread in place", () => {
    const next = withThread(
      [thread("a"), thread("b")],
      thread("a", { content: "Edited" }),
    );
    expect(next.map((item) => item.content)).toEqual(["Edited", "Comment"]);
  });
});

describe("withoutComment", () => {
  it("removes a thread with its replies", () => {
    expect(
      withoutComment(
        [thread("a", { replies: [reply("r", "a")] }), thread("b")],
        { id: "a", parentId: null },
      ).map((item) => item.id),
    ).toEqual(["b"]);
  });

  it("removes one reply and keeps the thread", () => {
    const next = withoutComment(
      [thread("a", { replies: [reply("r1", "a"), reply("r2", "a")] })],
      { id: "r1", parentId: "a" },
    );
    expect(next[0].replies.map((item) => item.id)).toEqual(["r2"]);
  });
});

describe("withAnchors", () => {
  it("moves only the threads a save re-anchored", () => {
    const threads = [thread("a"), thread("b")];
    const next = withAnchors(threads, [
      { id: "b", quote: "new quote", prefix: "p", suffix: "s" },
      { id: "gone", quote: "x", prefix: "", suffix: "" },
    ]);
    expect(next[0]).toBe(threads[0]);
    expect(next[1].anchor).toEqual({
      quote: "new quote",
      prefix: "p",
      suffix: "s",
    });
  });

  it("returns the same list when nothing moved", () => {
    const threads = [thread("a")];
    expect(withAnchors(threads, [])).toBe(threads);
  });
});
