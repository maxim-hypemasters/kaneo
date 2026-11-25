import { boundedTaskRead } from "../task/bounded-read";
import { findCommentDocument } from "./find-comment-document";
import { readCommentThreads } from "./read-comment-threads";
import type { CommentTarget } from "./target";

// Every thread, open and resolved: clients filter, and need the resolved ones
// to follow a link to a thread that has since been resolved.
export async function listDocumentComments(target: CommentTarget) {
  return boundedTaskRead(async (tx) => {
    await findCommentDocument(tx, target);
    return readCommentThreads(tx, target);
  }, "Comments request took too long; retry later");
}
