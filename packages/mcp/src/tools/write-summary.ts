const DOCUMENT_FIELDS = [
  "id",
  "projectId",
  "parentId",
  "featureId",
  "title",
  "revision",
  "updatedAt",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What a document write returns instead of echoing the body back: its
 * metadata and totalLength, counted in UTF-16 code units like the paged reads.
 */
export function summarizeDocumentWrite(document: unknown): unknown {
  if (!isRecord(document)) return document;
  const summary: Record<string, unknown> = {};
  for (const field of DOCUMENT_FIELDS)
    if (field in document) summary[field] = document[field];
  summary.totalLength =
    typeof document.body === "string" ? document.body.length : 0;
  return summary;
}

/**
 * A task without its description, plus descriptionLength counted in Unicode
 * code points like get_task_description.
 */
export function summarizeTaskDescriptionWrite(task: unknown): unknown {
  if (!isRecord(task)) return task;
  const { description, ...rest } = task;
  return {
    ...rest,
    descriptionLength:
      typeof description === "string" ? Array.from(description).length : 0,
  };
}
