import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import { i18n } from "@/lib/i18n";
import { getImageAltText, isSupportedImageFile } from "@/lib/upload-task-image";

// Stores a file for a comment on a test case and returns what the editor
// inserts. The upload stays with the test case until no comment uses it.
export async function uploadTestCaseAsset(testCaseId: string, file: File) {
  const route = client["test-case"][":id"]["comment-upload"];
  const param = { id: testCaseId };
  const json = {
    filename: file.name || "file",
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
  const staged = await route.$put({ param, json });
  if (!staged.ok) throw await HttpError.fromResponse(staged);
  const upload = await staged.json();
  const stored = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file,
  });
  if (!stored.ok)
    throw new Error(i18n.t("activity:comment.editor.failedToUploadFile"));
  const finalized = await route.finalize.$post({
    param,
    json: { ...json, key: upload.key },
  });
  if (!finalized.ok) throw await HttpError.fromResponse(finalized);
  const asset = await finalized.json();
  return {
    url: asset.url,
    alt: getImageAltText(file.name || "image"),
    filename: json.filename,
    kind: isSupportedImageFile(file)
      ? ("image" as const)
      : ("attachment" as const),
    mimeType: json.contentType,
    size: file.size,
  };
}
