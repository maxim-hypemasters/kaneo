import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { assetTable } from "../../database/schema";
import { withVerifiedStorageObject } from "../../storage/cleanup-queue";
import {
  assertTaskImageKeyMatchesContext,
  createTaskImageUploadUrl,
  InvalidUploadedAssetError,
  isImageContentType,
  validateTaskAssetUploadInput,
  verifyTaskAssetUpload,
} from "../../storage/s3";
import { findTestCase } from "../access";
import type { TestCaseScope } from "../schema";
import type { CommentUpload } from "./schema";

function assertValidUpload({ contentType, size }: CommentUpload) {
  try {
    validateTaskAssetUploadInput(contentType, size);
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : "Invalid upload",
    });
  }
}

// Uploads in a test case's comments are stored under that test case, like a
// task's comment uploads are under the task.
const uploadScope = (scope: TestCaseScope, testCaseId: string) => ({
  workspaceId: scope.workspaceId,
  projectId: scope.projectId,
  testCaseId,
  surface: "comment" as const,
});

export async function createCommentUpload(
  scope: TestCaseScope,
  testCaseId: string,
  upload: CommentUpload,
) {
  assertValidUpload(upload);
  await findTestCase(db, scope, testCaseId);
  try {
    return await createTaskImageUploadUrl({
      ...uploadScope(scope, testCaseId),
      ...upload,
    });
  } catch (error) {
    throw new HTTPException(503, {
      message:
        error instanceof Error
          ? error.message
          : "Image uploads are not configured",
    });
  }
}

// Records the stored file as an asset of the test case and returns its id.
export async function finalizeCommentUpload(
  scope: TestCaseScope,
  testCaseId: string,
  { key, ...upload }: CommentUpload & { key: string },
) {
  assertValidUpload(upload);
  await findTestCase(db, scope, testCaseId);
  const objectKey = key.trim();
  if (
    !assertTaskImageKeyMatchesContext(objectKey, uploadScope(scope, testCaseId))
  )
    throw new HTTPException(400, {
      message: "Upload key does not belong to this test case.",
    });

  const asset = await withVerifiedStorageObject(
    objectKey,
    async () => {
      try {
        return await verifyTaskAssetUpload(objectKey, upload);
      } catch (error) {
        const invalid = error instanceof InvalidUploadedAssetError;
        throw new HTTPException(invalid ? 400 : 503, {
          message: invalid
            ? error.message
            : "Unable to verify uploaded object.",
        });
      }
    },
    async (tx, uploaded) => {
      const values = {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        testCaseId,
        filename: upload.filename,
        mimeType: uploaded.contentType,
        size: uploaded.size,
        kind: isImageContentType(uploaded.contentType) ? "image" : "attachment",
        surface: "comment",
        createdBy: scope.userId,
      };
      // Finalizing the same upload twice keeps its one asset.
      const [saved] = await tx
        .insert(assetTable)
        .values({ ...values, objectKey })
        .onConflictDoUpdate({ target: assetTable.objectKey, set: values })
        .returning({ id: assetTable.id });
      return saved;
    },
  );
  if (!asset) throw new HTTPException(500, { message: "Failed to save asset" });
  return asset.id;
}
