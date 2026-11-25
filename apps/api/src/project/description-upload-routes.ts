import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { createRoute, errorResponse, jsonResponse } from "../openapi";
import { finalizedAssetSchema, imageUploadSchema } from "../task/response";
import {
  finalizeStagedImageUploadBody,
  stagedImageUploadBody,
} from "../task/schema";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { projectParam } from "./schema";

// Uploads for the project description are staged under project:edit_details,
// like the description itself, and claimed by the details save that first
// references them.
const middleware = [
  workspaceAccess.fromProject(),
  requireWorkspacePermission({ project: ["edit_details"] }),
  requireEntitlement,
] as const;
const errors = {
  400: errorResponse("Invalid upload"),
  402: errorResponse("Workspace plan expired"),
  403: errorResponse(
    "No access to the project or missing project:edit_details",
  ),
  404: errorResponse("Project not found"),
  503: errorResponse("Storage unavailable"),
};

export const stageProjectDescriptionAssetRoute = createRoute({
  method: "post",
  operationId: "stageProjectDescriptionAsset",
  path: "/{id}/description/draft-upload",
  tags: ["Projects"],
  summary: "Stage an upload for the project description",
  description:
    "Upload an image or file before the details save that references it. Staged assets are private to the uploader and expire after 24 hours unless a save claims them.",
  middleware: [...middleware],
  request: {
    params: projectParam,
    body: {
      required: true,
      content: { "application/json": { schema: stagedImageUploadBody } },
    },
  },
  responses: {
    200: jsonResponse("Presigned upload", imageUploadSchema),
    ...errors,
  },
});

export const finalizeProjectDescriptionAssetRoute = createRoute({
  method: "post",
  operationId: "finalizeProjectDescriptionAsset",
  path: "/{id}/description/draft-upload/finalize",
  tags: ["Projects"],
  summary: "Finalize a staged upload for the project description",
  middleware: [...middleware],
  request: {
    params: projectParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: finalizeStagedImageUploadBody },
      },
    },
  },
  responses: {
    200: jsonResponse("Staged attachment", finalizedAssetSchema),
    ...errors,
  },
});
