import { createHash } from "node:crypto";
import type { ReadReceipt } from "../message-types";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The receipt version of a task description: sha256 hex, null read as "". */
export function taskDescriptionVersion(description: string | null): string {
  return createHash("sha256")
    .update(description ?? "", "utf8")
    .digest("hex");
}

const startsAtZero = (args: Json, result: Json) =>
  (args.offset ?? 0) === 0 && (result.offset ?? 0) === 0;

// The id comes from the arguments, which the later write names too; a result
// for another id gives no receipt.
function targetId(
  args: Json,
  argKey: string,
  result: Json,
  resultKey: string,
): string | null {
  const id = args[argKey];
  if (typeof id !== "string" || id.length === 0) return null;
  const echoed = result[resultKey];
  return echoed === undefined || echoed === id ? id : null;
}

function documentReceipt(
  kind: "project_page" | "feature_document",
  id: string | null,
  args: Json,
  result: Json,
): ReadReceipt | null {
  if (
    id === null ||
    result.truncated !== false ||
    !startsAtZero(args, result) ||
    typeof result.body !== "string" ||
    !Number.isInteger(result.revision)
  )
    return null;
  return { kind, id, version: String(result.revision) };
}

/**
 * A receipt proves the model saw a whole document or description unchanged,
 * which a later rewrite of it requires. `bodyComplete` comes from compaction:
 * false when the body was cut to fit.
 */
export function extractReadReceipt(
  toolName: string,
  args: Record<string, unknown>,
  parsedResult: unknown,
  bodyComplete: boolean,
): ReadReceipt | null {
  if (!bodyComplete || !isRecord(parsedResult)) return null;
  const result = parsedResult;

  switch (toolName) {
    case "get_project_page":
      return documentReceipt(
        "project_page",
        targetId(args, "pageId", result, "id"),
        args,
        result,
      );
    case "get_feature_document":
      return documentReceipt(
        "feature_document",
        targetId(args, "documentId", result, "id"),
        args,
        result,
      );
    case "get_task_description": {
      const id = targetId(args, "taskId", result, "taskId");
      if (
        id === null ||
        result.truncated !== false ||
        !startsAtZero(args, result) ||
        typeof result.content !== "string"
      )
        return null;
      return {
        kind: "task_description",
        id,
        version: taskDescriptionVersion(result.content),
      };
    }
    case "get_task": {
      const id = targetId(args, "taskId", result, "id");
      const { description } = result;
      if (
        id === null ||
        // A board read leaves long descriptions out; null is then not empty.
        result.descriptionDeferred === true ||
        (typeof description !== "string" && description !== null)
      )
        return null;
      return {
        kind: "task_description",
        id,
        version: taskDescriptionVersion(description),
      };
    }
    default:
      return null;
  }
}
