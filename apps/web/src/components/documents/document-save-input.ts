import { extractAssetIds } from "@/lib/extract-asset-ids";

export type DocumentText = { title: string; body: string };
export type SavedDocument = DocumentText & { revision: number };
export type DocumentSaveInput = {
  title?: string;
  body?: string;
  expectedRevision: number;
  draftAssetIds?: string[];
};

// What a save has to send, or null when the local text is already saved.
// A blank title is never sent: the server requires one.
export function documentSaveInput(
  local: DocumentText,
  saved: SavedDocument,
  staged: ReadonlySet<string>,
): DocumentSaveInput | null {
  const title = local.title.trim();
  const titleChanged = title !== "" && title !== saved.title;
  const bodyChanged = local.body !== saved.body;
  if (!titleChanged && !bodyChanged) return null;
  const input: DocumentSaveInput = { expectedRevision: saved.revision };
  if (titleChanged) input.title = title;
  if (bodyChanged) {
    input.body = local.body;
    // Uploads are claimed only once the saved text refers to them.
    const referenced = staged.size
      ? extractAssetIds(local.body)
      : new Set<string>();
    const draftAssetIds = [...staged].filter((id) => referenced.has(id));
    if (draftAssetIds.length) input.draftAssetIds = draftAssetIds;
  }
  return input;
}
