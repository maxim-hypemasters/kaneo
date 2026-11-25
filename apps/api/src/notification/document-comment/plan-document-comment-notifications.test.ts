import { describe, expect, it } from "vite-plus/test";
import { planDocumentCommentNotifications } from "./plan-document-comment-notifications";

const readerIds = ["author", "ana", "ben", "cy"];

describe("planDocumentCommentNotifications", () => {
  it("notifies the people mentioned in a new thread", () => {
    expect(
      planDocumentCommentNotifications({
        authorId: "author",
        mentionedIds: ["ana", "ben"],
        participantIds: [],
        readerIds,
      }),
    ).toEqual([
      { userId: "ana", type: "document_mention" },
      { userId: "ben", type: "document_mention" },
    ]);
  });

  it("notifies the thread's starter and earlier repliers of a reply", () => {
    expect(
      planDocumentCommentNotifications({
        authorId: "author",
        mentionedIds: [],
        participantIds: ["ana", "ben", "ana"],
        readerIds,
      }),
    ).toEqual([
      { userId: "ana", type: "document_comment_reply" },
      { userId: "ben", type: "document_comment_reply" },
    ]);
  });

  it("sends one mention to a participant who is also mentioned", () => {
    expect(
      planDocumentCommentNotifications({
        authorId: "author",
        mentionedIds: ["ana"],
        participantIds: ["ana", "ben"],
        readerIds,
      }),
    ).toEqual([
      { userId: "ana", type: "document_mention" },
      { userId: "ben", type: "document_comment_reply" },
    ]);
  });

  it("never notifies the author", () => {
    expect(
      planDocumentCommentNotifications({
        authorId: "author",
        mentionedIds: ["author"],
        participantIds: ["author"],
        readerIds,
      }),
    ).toEqual([]);
  });

  it("leaves out people who cannot read the document and deleted users", () => {
    expect(
      planDocumentCommentNotifications({
        authorId: "author",
        mentionedIds: ["outsider", "ana"],
        participantIds: [null, "stranger", "ben"],
        readerIds,
      }),
    ).toEqual([
      { userId: "ana", type: "document_mention" },
      { userId: "ben", type: "document_comment_reply" },
    ]);
  });
});
