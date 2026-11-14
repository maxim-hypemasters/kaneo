import { i18n } from "@/lib/i18n";
import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import { getImageAltText, isSupportedImageFile } from "@/lib/upload-task-image";

type UploadInput = {
  filename: string;
  contentType: string;
  size: number;
  surface: "description";
};
type StagedUpload = {
  uploadUrl: string;
  headers: Record<string, string>;
  key: string;
};
type ApiResponse = Pick<Response, "ok" | "status" | "text"> & {
  json: () => Promise<unknown>;
};
type Endpoints = {
  stage: (json: UploadInput) => Promise<ApiResponse>;
  finalize: (json: UploadInput & { key: string }) => Promise<ApiResponse>;
};

// Stages an upload, stores the file, then finalizes it as a private draft
// that the next save referencing it claims.
async function uploadThrough(endpoints: Endpoints, file: File) {
  const json: UploadInput = {
    filename: file.name || "file",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    surface: "description",
  };
  const response = await endpoints.stage(json);
  if (!response.ok) throw await HttpError.fromResponse(response);
  const upload = (await response.json()) as StagedUpload;
  const stored = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file,
  });
  if (!stored.ok)
    throw new Error(i18n.t("activity:comment.editor.failedToUploadFile"));
  const finalized = await endpoints.finalize({ ...json, key: upload.key });
  if (!finalized.ok) throw await HttpError.fromResponse(finalized);
  const asset = (await finalized.json()) as { id: string; url: string };
  return {
    id: asset.id,
    url: asset.url,
    alt: getImageAltText(file.name),
    filename: json.filename,
    kind: isSupportedImageFile(file)
      ? ("image" as const)
      : ("attachment" as const),
    mimeType: json.contentType,
    size: file.size,
  };
}

export async function uploadDraftAsset(
  projectId: string,
  file: File,
  taskId?: string,
) {
  return uploadThrough(
    taskId
      ? {
          stage: (json) =>
            client.task.description[":id"]["draft-upload"].$post({
              param: { id: taskId },
              json,
            }),
          finalize: (json) =>
            client.task.description[":id"]["draft-upload"].finalize.$post({
              param: { id: taskId },
              json,
            }),
        }
      : {
          stage: (json) =>
            client.task["draft-upload"][":projectId"].$post({
              param: { projectId },
              json,
            }),
          finalize: (json) =>
            client.task["draft-upload"][":projectId"].finalize.$post({
              param: { projectId },
              json,
            }),
        },
    file,
  );
}

// Project pages stage uploads under their own document permission.
export async function uploadProjectDocumentAsset(
  projectId: string,
  file: File,
) {
  const route =
    client["project-document"].project[":projectId"]["draft-upload"];
  return uploadThrough(
    {
      stage: (json) => route.$post({ param: { projectId }, json }),
      finalize: (json) => route.finalize.$post({ param: { projectId }, json }),
    },
    file,
  );
}
