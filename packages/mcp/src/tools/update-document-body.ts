import { appendMarkdown } from "./append-to-document.js";

export type DocumentEdit = {
  title?: string;
  /** New full body; needs expectedRevision. */
  body?: string;
  appendMarkdown?: string;
  expectedRevision?: number;
};

export type CurrentDocument = { body: string; revision: number };

export type DocumentPutBody = {
  title?: string;
  body?: string;
  expectedRevision: number;
  keepRemovedAssets: true;
};

type ReadyOrInvalid =
  | { status: "ready"; put: DocumentPutBody }
  | { status: "invalid"; error: string };

export type DocumentUpdate =
  | ReadyOrInvalid
  /** Read the document and call again with it. */
  | { status: "needs-current" };

type Options = { noun: string; maxBody: number };

/**
 * Turns a rename, append or full replace into the body of a document PUT. The
 * API needs a revision on every save and an append needs the current body, so
 * without them it asks for the current document; a full replace never
 * re-reads, so a stale expectedRevision fails with a conflict. Removed
 * attachments are always kept.
 */
export function updateDocumentBody(
  edit: DocumentEdit,
  current: CurrentDocument,
  options: Options,
): ReadyOrInvalid;
export function updateDocumentBody(
  edit: DocumentEdit,
  current: null,
  options: Options,
): DocumentUpdate;
export function updateDocumentBody(
  edit: DocumentEdit,
  current: CurrentDocument | null,
  options: Options,
): DocumentUpdate {
  const { appendMarkdown: addition, title, body, expectedRevision } = edit;
  if (body !== undefined && addition !== undefined)
    return {
      status: "invalid",
      error: "Send body or appendMarkdown, not both.",
    };
  if (title === undefined && body === undefined && addition === undefined)
    return { status: "invalid", error: "Send title, body or appendMarkdown." };
  if (body !== undefined && expectedRevision === undefined)
    return {
      status: "invalid",
      error: `Replacing the body needs expectedRevision. Read the whole ${options.noun} first, or use appendMarkdown.`,
    };
  const put = (revision: number, newBody = body): DocumentUpdate => ({
    status: "ready",
    put: {
      ...(title === undefined ? {} : { title }),
      ...(newBody === undefined ? {} : { body: newBody }),
      expectedRevision: revision,
      keepRemovedAssets: true,
    },
  });
  if (addition === undefined && expectedRevision !== undefined)
    return put(expectedRevision);
  if (!current) return { status: "needs-current" };
  const revision = expectedRevision ?? current.revision;
  if (addition === undefined) return put(revision);
  const appended = appendMarkdown(current.body, addition);
  if (appended.length > options.maxBody)
    return {
      status: "invalid",
      error: `The ${options.noun} body would exceed ${options.maxBody} characters.`,
    };
  return put(revision, appended);
}
