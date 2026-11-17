import { REWRITE_MAX_CHARS } from "../constants";
import type { ReadReceipt } from "../message-types";
import { taskDescriptionVersion } from "../tools/read-receipt";
import type { ProposalContext } from "../turn/run-tool-calls";
import { appendPreview } from "./append-preview";
import { checkRewriteReceipt } from "./check-rewrite-receipt";

type Args = Record<string, unknown>;

type DocumentEditSpec = {
  kind: ReadReceipt["kind"];
  /** The argument naming the document; receipts carry the same id. */
  idKey: string;
  /** The argument holding a full replacement. */
  bodyKey: "body" | "description";
  expectation: "expectedRevision" | "expectedDescription";
  /** The read that yields a receipt, named in the refusal. */
  readTool: string;
  noun: string;
};

const DOCUMENT_EDITS: Record<string, DocumentEditSpec> = {
  update_project_page: {
    kind: "project_page",
    idKey: "pageId",
    bodyKey: "body",
    expectation: "expectedRevision",
    readTool: "get_project_page",
    noun: "page",
  },
  update_feature_document: {
    kind: "feature_document",
    idKey: "documentId",
    bodyKey: "body",
    expectation: "expectedRevision",
    readTool: "get_feature_document",
    noun: "Feature document",
  },
  update_task_description: {
    kind: "task_description",
    idKey: "taskId",
    bodyKey: "description",
    expectation: "expectedDescription",
    readTool: "get_task_description",
    noun: "task description",
  },
};

export const isDocumentEdit = (toolName: string) =>
  Object.hasOwn(DOCUMENT_EDITS, toolName);

/** The argument a document edit replaces the body with, if any. */
export const documentBodyKey = (toolName: string) =>
  DOCUMENT_EDITS[toolName]?.bodyKey;

/**
 * The arguments of a full replace with a stand-in for the expectation the
 * model never sends, so the tool's schema accepts them. The proposal then
 * sets the real expectation from the current text, or refuses the rewrite.
 */
export function withExpectationPlaceholder(toolName: string, args: Args): Args {
  const spec = DOCUMENT_EDITS[toolName];
  if (!spec || args[spec.bodyKey] === undefined) return args;
  return {
    ...args,
    [spec.expectation]: spec.expectation === "expectedRevision" ? 1 : "",
  };
}

/** A document's current text, its receipt version and what a write expects. */
export type CurrentDocument = {
  body: string;
  version: string;
  expectation: number | string;
};

/** Reads the current text from the entity a document edit targets. */
export function currentDocumentOf(
  toolName: string,
  entity: Args,
): CurrentDocument | null {
  const spec = DOCUMENT_EDITS[toolName];
  if (!spec) return null;
  if (spec.expectation === "expectedDescription") {
    const description =
      typeof entity.description === "string" ? entity.description : null;
    return {
      body: description ?? "",
      version: taskDescriptionVersion(description),
      expectation: description ?? "",
    };
  }
  if (typeof entity.body !== "string" || !Number.isInteger(entity.revision))
    return null;
  return {
    body: entity.body,
    version: String(entity.revision),
    expectation: entity.revision as number,
  };
}

export type DocumentEditPlan =
  | {
      ok: true;
      diff: { before: string; after: string } | null;
      /** The arguments to execute, with the expectation set or removed. */
      args: Args;
    }
  | { ok: false; error: string };

/**
 * Checks a page, Feature document or task description edit and builds its
 * diff. A full replace needs a receipt for the current version from a read
 * the model saw in full, and gets that version as its expectation, so a
 * later edit fails with a conflict instead of being overwritten. Appends and
 * renames re-read the current text when they run, so they carry none.
 */
export function planDocumentEdit(input: {
  toolName: string;
  args: Args;
  current: CurrentDocument;
  proposal: ProposalContext;
}): DocumentEditPlan {
  const spec = DOCUMENT_EDITS[input.toolName];
  if (!spec) return { ok: true, diff: null, args: input.args };
  const { current } = input;
  const { [spec.expectation]: _expected, ...rest } = input.args;
  const body = input.args[spec.bodyKey];
  const addition = input.args.appendMarkdown;

  if (typeof body === "string" && typeof addition === "string")
    return {
      ok: false,
      error: `Send ${spec.bodyKey} or appendMarkdown, not both. Nothing was proposed.`,
    };

  if (typeof body === "string") {
    if (body.length > REWRITE_MAX_CHARS)
      return {
        ok: false,
        error: `The new ${spec.noun} is longer than ${REWRITE_MAX_CHARS} characters, too long to propose as a rewrite. Use appendMarkdown to add to it instead. Nothing was proposed.`,
      };
    const id = input.args[spec.idKey];
    const seen =
      typeof id === "string" &&
      checkRewriteReceipt({
        kind: spec.kind,
        id,
        currentVersion: current.version,
        transcript: input.proposal.transcript,
        replayedToolRowIds: input.proposal.replayedToolRowIds,
      });
    if (!seen)
      return {
        ok: false,
        error: `This replaces the whole ${spec.noun}, but you haven't seen its full current text. Read the full current text with ${spec.readTool} first, or use appendMarkdown. Nothing was proposed.`,
      };
    return {
      ok: true,
      diff: { before: current.body, after: body },
      args: { ...rest, [spec.expectation]: current.expectation },
    };
  }

  if (typeof addition === "string")
    return {
      ok: true,
      diff: appendPreview(current.body, addition),
      args: rest,
    };
  return { ok: true, diff: null, args: rest };
}
