import { describe, expect, it } from "vite-plus/test";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import { sortThreads } from "./sort-threads";

function thread(id: string, resolved = false) {
  return {
    id,
    resolvedAt: resolved ? "2026-11-20T10:00:00.000Z" : null,
  } as DocumentCommentThread;
}

describe("sortThreads", () => {
  const threads = [
    thread("oldest"),
    thread("detached"),
    thread("done", true),
    thread("newest"),
  ];

  it("lists open threads by their place in the text, detached ones last", () => {
    expect(
      sortThreads(threads, "open", ["newest", "done", "oldest"]).map(
        (item) => item.id,
      ),
    ).toEqual(["newest", "oldest", "detached"]);
  });

  it("keeps detached threads in the order they were started", () => {
    expect(sortThreads(threads, "open", []).map((item) => item.id)).toEqual([
      "oldest",
      "detached",
      "newest",
    ]);
  });

  it("lists only resolved threads under Resolved", () => {
    expect(
      sortThreads(threads, "resolved", ["done"]).map((item) => item.id),
    ).toEqual(["done"]);
  });
});
