import { taskResource } from "./task-resource";
import {
  featureLinkCandidatesQuery,
  featureLinkCandidatesSchema,
} from "./feature-link-candidates-schema";
import { readFeatureLinkCandidates } from "./controllers/read-feature-link-candidates";
import {
  featureLibraryQuery,
  featureLibrarySchema,
} from "./feature-library-schema";
import { listFeatureLibrary } from "./controllers/list-feature-library";
import { archiveFeature } from "./controllers/archive-feature";
import { withVerifiedStorageObject } from "../storage/cleanup-queue";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import db from "../database";
import {
  assetTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../database/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import {
  assertTaskImageKeyMatchesContext,
  createTaskImageUploadUrl,
  InvalidUploadedAssetError,
  isImageContentType,
  validateTaskAssetUploadInput,
  verifyTaskAssetUpload,
} from "../storage/s3";
import { normalizeApiServerUrl } from "../utils/openapi-spec";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import {
  validateAndParseDate,
  validateDateRange,
} from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import bulkUpdateTasks from "./controllers/bulk-update-tasks";
import createTask from "./controllers/create-task";
import deleteTask from "./controllers/delete-task";
import duplicateTask from "./controllers/duplicate-task";
import exportTasks from "./controllers/export-tasks";
import getAssignedTasks from "./controllers/get-assigned-tasks";
import getTaskByTicketId from "./controllers/get-task-by-ticket-id";
import getTask from "./controllers/get-task";
import getTasks from "./controllers/get-tasks";
import importTasks from "./controllers/import-tasks";
import { importHierarchy } from "./transfers/import-hierarchy";
import listProjectFeatures from "./controllers/list-project-features";
import moveTask from "./controllers/move-task";
import reorderTasks from "./controllers/reorder-tasks";
import {
  stageTaskAssetUpload,
  finalizeStagedTaskAsset,
} from "./controllers/stage-task-asset";
import {
  requireBulkTaskEntitlement,
  requireBulkTaskPermission,
  requireTaskAssigneePermission,
  requireFeatureCompositionPermission,
} from "./controllers/require-task-permission";
import updateTask from "./controllers/update-task";
import updateTaskAssignee from "./controllers/update-task-assignee";
import updateTaskDescription from "./controllers/update-task-description";
import updateTaskDueDate from "./controllers/update-task-due-date";
import updateTaskPriority from "./controllers/update-task-priority";
import updateTaskStatus from "./controllers/update-task-status";
import updateTaskTitle from "./controllers/update-task-title";
import updateTaskMilestone from "./controllers/update-task-milestone";
import updateTaskFeature from "./controllers/update-task-feature";
import updateTaskRelease from "./controllers/update-task-release";
import updateTaskType from "./controllers/update-task-type";
import {
  getDeferredDescriptionMatches,
  getDescriptionPage,
} from "./description-pages";
import {
  assignedTasksSchema,
  boardSchema,
  bulkResultSchema,
  descriptionMatchesSchema,
  descriptionPageSchema,
  finalizedAssetSchema,
  imageUploadSchema,
  moveTaskResultSchema,
  projectFeatureListSchema,
  taskByTicketIdSchema,
  taskExportSchema,
  taskImportResultSchema,
  taskReleaseResultSchema,
  taskSchema,
  taskWithAssigneeSchema,
} from "./response";
import {
  assignedTasksQuery,
  bulkUpdateBody,
  createTaskBody,
  descriptionMatchesQuery,
  descriptionPageQuery,
  duplicateTaskBody,
  finalizeImageUploadBody,
  imageUploadBody,
  stagedImageUploadBody,
  finalizeStagedImageUploadBody,
  importTasksBody,
  listTasksQuery,
  moveTaskBody,
  projectIdParam,
  reorderTasksBody,
  taskParam,
  ticketIdParam,
  ticketIdQuery,
  updateAssigneeBody,
  updateDescriptionBody,
  updateDueDateBody,
  updatePriorityBody,
  updateStatusBody,
  updateTaskBody,
  updateTitleBody,
  updateFeatureBody,
  updateMilestoneBody,
  updateTaskReleaseBody,
  updateTypeBody,
} from "./schema";

const listAssignedTasksRoute = createRoute({
  method: "get",
  operationId: "listAssignedTasks",
  path: "/assigned",
  tags: ["Tasks"],
  summary: "List my assigned tasks",
  description:
    "Get the open tasks assigned to the caller across a workspace's active projects. Completed and archived tasks are excluded. Ordered by due date (undated last), then priority. At most 100 tasks are returned; total counts all of them. Set countOnly=true to return just that total without loading task rows or labels.",
  middleware: [
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: { query: assignedTasksQuery },
  responses: {
    200: jsonResponse("Open tasks assigned to the caller", assignedTasksSchema),
    400: errorResponse("Invalid workspace ID or query parameters"),
    403: errorResponse("Missing project:read or task:read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const listProjectFeaturesRoute = createRoute({
  method: "get",
  operationId: "listProjectFeatures",
  path: "/features/{projectId}",
  tags: ["Tasks"],
  summary: "List project features",
  description:
    "Get the project's Feature knowledge summaries, including archived records for existing references, by title. Planning fields are null. Lighter than the board for picking a feature.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The project's features", projectFeatureListSchema),
    403: errorResponse(
      "No access to the project, or missing task:read permission",
    ),
    404: errorResponse("Project not found"),
  },
});

const featureLibraryRoute = createRoute({
  method: "get",
  operationId: "listFeatureLibrary",
  path: "/feature-library/{projectId}",
  tags: ["Features"],
  summary: "Search active or archived knowledge Features",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: projectIdParam, query: featureLibraryQuery },
  responses: {
    200: jsonResponse("Feature library", featureLibrarySchema),
    409: errorResponse("Project changed workspaces; retry"),
    403: errorResponse("No project access"),
    404: errorResponse("Project not found"),
  },
});
const featureLinkCandidatesRoute = createRoute({
  method: "get",
  operationId: "listFeatureLinkCandidates",
  path: "/feature-link-candidates/{projectId}",
  tags: ["Features"],
  summary: "Find existing work for a new Feature",
  description:
    "Search nonarchived Tasks and Bugs without a Feature in this project, including Done work. Eligibility and title/identifier search are applied before pagination. Returns compact identity and current release metadata.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: projectIdParam, query: featureLinkCandidatesQuery },
  responses: {
    200: jsonResponse("Eligible Tasks and Bugs", featureLinkCandidatesSchema),
    400: errorResponse("Invalid search or pagination"),
    403: errorResponse("Missing task:read permission"),
    404: errorResponse("Project not found"),
    409: errorResponse("Project changed workspaces; retry"),
    503: errorResponse("Candidate read timed out"),
  },
});
const archiveFeatureRoute = createRoute({
  method: "put",
  operationId: "archiveFeature",
  path: "/{id}/feature-archive",
  tags: ["Features"],
  summary: "Archive or unarchive a knowledge Feature independently of its work",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: z.object({ archived: z.boolean() }) },
      },
    },
  },
  responses: {
    200: jsonResponse("Feature", taskSchema),
    400: errorResponse("Only Features support this operation"),
    403: errorResponse("No access"),
    404: errorResponse("Feature not found"),
    409: errorResponse("Feature moved"),
  },
});

const listTasksRoute = createRoute({
  method: "get",
  operationId: "listTasks",
  path: "/tasks/{projectId}",
  tags: ["Tasks"],
  summary: "List tasks",
  description:
    "Get a project's board: its columns, each with the tasks in it, plus the archived and planned buckets. Set releaseId to a release's id, or to none, to keep only the Tasks and Bugs in that release, or in none. Responses always contain at most 100 tasks (50 by default). Continue through pagination.totalPages for the whole board, and for each task page follow relatedPage through pagination.relatedTotalPages for all labels, links and column metadata. Filters and sorting apply before pagination. Descriptions larger than 64 KiB are omitted with descriptionDeferred=true; read the task detail or description pages for full text.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam, query: listTasksQuery },
  responses: {
    200: jsonResponse("The project board", boardSchema),
    503: errorResponse("Task list request timed out"),
    403: errorResponse("No access to the project"),
    404: errorResponse("Project not found"),
  },
});

const bulkUpdateTasksRoute = createRoute({
  method: "patch",
  operationId: "bulkUpdateTasks",
  path: "/bulk",
  tags: ["Tasks"],
  summary: "Bulk update tasks",
  description:
    "Apply one operation to many tasks at once. Every task must be in the same workspace.",
  middleware: [
    workspaceAccess.fromTasks(),
    requireBulkTaskPermission,
    requireBulkTaskEntitlement,
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: bulkUpdateBody } },
    },
  },
  responses: {
    200: jsonResponse("Bulk operation result", bulkResultSchema),
    400: errorResponse(
      "Invalid body, or the tasks span more than one workspace",
    ),
    403: errorResponse(
      "No access to the project, or missing the permission the operation needs",
    ),
    404: errorResponse("No tasks found"),
    409: errorResponse("Tasks changed projects; retry the operation"),
  },
});

const stagedUploadRoute = createRoute({
  method: "post",
  operationId: "stageTaskAssetUpload",
  path: "/draft-upload/{projectId}",
  tags: ["Tasks"],
  summary: "Stage a task attachment",
  description:
    "Upload an attachment before submitting a task. Staged assets are private to the uploader and expire after 24 hours.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: stagedImageUploadBody } },
    },
  },
  responses: {
    200: jsonResponse("Presigned upload", imageUploadSchema),
    400: errorResponse("Invalid upload"),
    403: errorResponse("Missing task:create permission"),
    404: errorResponse("Project not found"),
    503: errorResponse("Storage unavailable"),
  },
});
const finalizeStagedUploadRoute = createRoute({
  method: "post",
  operationId: "finalizeStagedTaskAsset",
  path: "/draft-upload/{projectId}/finalize",
  tags: ["Tasks"],
  summary: "Finalize a staged task attachment",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: finalizeStagedImageUploadBody },
      },
    },
  },
  responses: {
    200: jsonResponse("Staged attachment", finalizedAssetSchema),
    400: errorResponse("Invalid upload"),
    403: errorResponse("Missing task:create permission"),
    404: errorResponse("Project not found"),
    409: errorResponse("Upload already attached"),
    503: errorResponse("Storage unavailable"),
  },
});

const reorderTasksRoute = createRoute({
  method: "post",
  operationId: "reorderTasks",
  path: "/reorder",
  tags: ["Tasks"],
  summary: "Reorder or move cards",
  description:
    "Atomically update positions and optional column status for cards in one project. Other task fields are preserved.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: reorderTasksBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "Updated card positions and statuses",
      z
        .object({ id: z.string(), position: z.number(), status: z.string() })
        .array(),
    ),
    400: errorResponse("Invalid positions or column"),
    403: errorResponse("Missing task:update permission"),
    404: errorResponse(
      "Project not found, or tasks do not belong to the project",
    ),
    409: errorResponse(
      "Board changed or task moved; refresh before reordering",
    ),
  },
});
const createTaskRoute = createRoute({
  method: "post",
  operationId: "createTask",
  path: "/{projectId}",
  tags: ["Tasks"],
  summary: "Create task",
  description:
    "Add a task, bug or feature to a project, defaulting to task. Tasks and Bugs use the column named by status; Features omit planning fields. Tasks and bugs may belong to a feature. Without releaseId they inherit their milestone's release; an explicit releaseId, or null for none, wins. Feature-only featureComposition creates milestones, links unowned nonarchived Tasks/Bugs and creates title-only work in the same transaction. Failures roll back every record and number allocation. Existing work preserves non-null releases; new work follows its draft milestone, or unassignedReleaseId when no milestone is selected.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
    requireFeatureCompositionPermission,
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("The created task", taskSchema),
    400: errorResponse("Invalid body"),
    402: errorResponse("Workspace plan has expired"),
    403: errorResponse(
      "No project access, or missing task:create, task:update or task:assign permission required by the request",
    ),
    404: errorResponse("Project, feature or release not found"),
    409: errorResponse(
      "Invalid Feature membership or stale existing-work selection",
    ),
  },
});

const duplicateTaskRoute = createRoute({
  method: "post",
  path: "/duplicate/{id}",
  operationId: "duplicateTask",
  tags: ["Tasks"],
  summary: "Duplicate a task",
  description:
    "Copy a task into the same project and column, including custom fields, labels, description assets, its type, its feature and its release (none if that release was deleted meanwhile). Comments, time entries and a feature's tasks are not copied.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: duplicateTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("The duplicated task", taskSchema),
    400: errorResponse("Invalid task fields or request"),
    401: errorResponse("Unauthorized"),
    403: errorResponse(
      "No access to the project, or missing task:create permission",
    ),
    404: errorResponse("Task or project not found"),
    409: errorResponse("Task column has reached its capacity"),
    503: errorResponse("Unable to copy task attachments"),
  },
});

const getTaskRoute = createRoute({
  method: "get",
  operationId: "getTask",
  path: "/{id}",
  tags: ["Tasks"],
  summary: "Get task",
  description:
    "Get a single task by ID, with its assignee name. The board view omits descriptions above 64 KiB and includes the task's own feature progress and its feature's.",
  middleware: [workspaceAccess.fromTask()] as const,
  request: {
    params: taskParam,
    query: z.object({ view: z.enum(["detail", "board"]).optional() }),
  },
  responses: {
    200: jsonResponse("Task details", taskWithAssigneeSchema),
    403: errorResponse("No access to the project"),
    404: errorResponse("Task not found"),
  },
});

const getTaskByTicketIdRoute = createRoute({
  method: "get",
  operationId: "getTaskByTicketId",
  path: "/by-ticket-id/{ticketId}",
  tags: ["Tasks"],
  summary: "Get task by ticket ID",
  description:
    "Get a single task by its project key and number, such as KAN-12. A match in an active project takes precedence, then the most recently archived project. If the ticket ID still matches multiple accessible tasks, narrow the lookup to a workspace with workspaceId or workspaceSlug, or to a single project with projectId.",
  request: { params: ticketIdParam, query: ticketIdQuery },
  responses: {
    200: jsonResponse("Task details", taskByTicketIdSchema),
    400: errorResponse("Invalid ticket ID"),
    404: errorResponse("No accessible task has this ticket ID"),
    409: errorResponse("Ticket ID matches multiple accessible tasks"),
  },
});

const moveTaskRoute = createRoute({
  method: "put",
  operationId: "moveTask",
  path: "/move/{id}",
  tags: ["Tasks"],
  summary: "Move task",
  description:
    "Move a task to another project, optionally into a named column. Both projects must be in the same workspace. Features and releases belong to one project, so the task leaves its feature and its release, recording each change in its activity.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: moveTaskBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "The moved task, with both project ids",
      moveTaskResultSchema,
    ),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task or destination project not found"),
    409: errorResponse("Task or project moved concurrently; retry the move"),
  },
});

const updateTaskRoute = createRoute({
  method: "put",
  operationId: "updateTask",
  path: "/{id}",
  tags: ["Tasks"],
  summary: "Update task",
  description:
    "Replace every field of a task. Its type, feature and release aren't part of this body and stay as they are: change them with PUT /task/type/{id}, /task/feature/{id} and /task/release/{id}. Use the single-field routes for narrower edits.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireTaskAssigneePermission,
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update or task:assign permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const exportTasksRoute = createRoute({
  method: "get",
  operationId: "exportTasks",
  path: "/export/{projectId}",
  tags: ["Tasks"],
  summary: "Export tasks",
  description:
    "Export a project's work and labels as version 2 JSON with portable Feature and milestone hierarchy.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The exported project and tasks", taskExportSchema),
    403: errorResponse("No access to the project"),
    404: errorResponse("Project not found"),
  },
});

const importTasksRoute = createRoute({
  method: "post",
  operationId: "importTasks",
  path: "/import/{projectId}",
  tags: ["Tasks"],
  summary: "Import tasks",
  description:
    "Import version 2 Feature/milestone hierarchy atomically, or legacy tasks with individual outcomes. Milestone hierarchy also requires task:update permission.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: importTasksBody } },
    },
  },
  responses: {
    200: jsonResponse("Per-task import outcome", taskImportResultSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:create permission",
    ),
    404: errorResponse("Project not found"),
  },
});

const deleteTaskRoute = createRoute({
  method: "delete",
  operationId: "deleteTask",
  path: "/{id}",
  tags: ["Tasks"],
  summary: "Delete task",
  description:
    "Permanently delete a task and its comments, labels, and time entries.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["delete"] }),
  ] as const,
  request: { params: taskParam },
  responses: {
    200: jsonResponse("The deleted task", taskSchema),
    409: errorResponse("Task changed projects; retry the operation"),
    403: errorResponse(
      "No access to the project, or missing task:delete permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskStatusRoute = createRoute({
  method: "put",
  operationId: "updateTaskStatus",
  path: "/status/{id}",
  tags: ["Tasks"],
  summary: "Update task status",
  description: "Move a task to another column in the same project.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateStatusBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskPriorityRoute = createRoute({
  method: "put",
  operationId: "updateTaskPriority",
  path: "/priority/{id}",
  tags: ["Tasks"],
  summary: "Update task priority",
  description: "Set a task's priority.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updatePriorityBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid priority"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskAssigneeRoute = createRoute({
  method: "put",
  operationId: "updateTaskAssignee",
  path: "/assignee/{id}",
  tags: ["Tasks"],
  summary: "Update task assignee",
  description:
    "Assign a task to a workspace member, or send null to unassign it.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["assign"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateAssigneeBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:assign permission",
    ),
    404: errorResponse(
      "Task not found, or assignee is not a member of the workspace",
    ),
  },
});

const updateTaskDueDateRoute = createRoute({
  method: "put",
  operationId: "updateTaskDueDate",
  path: "/due-date/{id}",
  tags: ["Tasks"],
  summary: "Update task due date",
  description: "Set or clear a task's due date.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateDueDateBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid date"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskTitleRoute = createRoute({
  method: "put",
  operationId: "updateTaskTitle",
  path: "/title/{id}",
  tags: ["Tasks"],
  summary: "Update task title",
  description: "Rename a task.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTitleBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskMilestoneRoute = createRoute({
  method: "patch",
  operationId: "updateTaskMilestone",
  path: "/{id}/milestone",
  tags: ["Tasks"],
  summary: "Assign or clear a task milestone",
  description:
    "Only tasks and bugs already in the milestone’s Feature can join it. Null clears membership without changing Feature or Release.",
  middleware: [
    workspaceAccess.fromTask("id"),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateMilestoneBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    402: errorResponse("Workspace plan has expired"),
    403: errorResponse("Missing task:update permission"),
    404: errorResponse("Task or milestone not found"),
    409: errorResponse("The task is a Feature or has no Feature"),
  },
});

const updateTaskFeatureRoute = createRoute({
  method: "put",
  operationId: "updateTaskFeature",
  path: "/feature/{id}",
  tags: ["Tasks"],
  summary: "Update task feature",
  description:
    "Put a task or bug into a feature of its project, or remove its membership. Either belongs to at most one feature; a feature can't belong to one. Feature membership does not change a Task/Bug release. Changing the Feature clears milestone membership.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateFeatureBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task or feature not found"),
    409: errorResponse(
      "The target isn't a feature, the task is itself a feature, or another edit changed it at the same time; try again",
    ),
  },
});

const updateTaskReleaseRoute = createRoute({
  method: "put",
  operationId: "updateTaskRelease",
  path: "/release/{id}",
  tags: ["Tasks"],
  summary: "Update task release",
  description:
    "Put a Task or Bug into a release of its project, or take it out with null. Features have no release. Milestone release updates move matching followers.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTaskReleaseBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "The updated task, with the tasks that moved along",
      taskReleaseResultSchema,
    ),
    400: errorResponse("Invalid body"),
    402: errorResponse("Workspace plan has expired"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task or release not found"),
    409: errorResponse(
      "Another edit changed these tasks at the same time; try again",
    ),
  },
});

const updateTaskTypeRoute = createRoute({
  method: "put",
  operationId: "updateTaskType",
  path: "/type/{id}",
  tags: ["Tasks"],
  summary: "Update task type",
  description:
    "Switch between Task and Bug while preserving identity, fields, Feature, milestone and Release. Features cannot be converted.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTypeBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
    409: errorResponse("Features cannot be converted to execution work"),
  },
});

const createTaskImageUploadRoute = createRoute({
  method: "put",
  operationId: "createTaskImageUpload",
  path: "/image-upload/{id}",
  tags: ["Tasks"],
  summary: "Create image upload URL",
  description:
    "Get a presigned URL for uploading an image used in a task description or comment. PUT the bytes to it, then call the finalize route.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: imageUploadBody } },
    },
  },
  responses: {
    200: jsonResponse("The presigned upload", imageUploadSchema),
    400: errorResponse("Unsupported content type, or the file is too large"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
    503: errorResponse("Image uploads are not configured on this instance"),
  },
});

const finalizeTaskImageUploadRoute = createRoute({
  method: "post",
  operationId: "finalizeTaskImageUpload",
  path: "/image-upload/{id}/finalize",
  tags: ["Tasks"],
  summary: "Finalize image upload",
  description:
    "Record an uploaded image as a private asset and return the URL to reference it by.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: finalizeImageUploadBody } },
    },
  },
  responses: {
    200: jsonResponse("The stored asset", finalizedAssetSchema),
    400: errorResponse(
      "Invalid upload, or the key does not belong to this task",
    ),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const updateTaskDescriptionRoute = createRoute({
  method: "put",
  operationId: "updateTaskDescription",
  path: "/description/{id}",
  tags: ["Tasks"],
  summary: "Update task description",
  description: "Replace a task's description.",
  middleware: [
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: taskParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateDescriptionBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No access to the project, or missing task:update permission",
    ),
    404: errorResponse("Task not found"),
  },
});

const descriptionPageRoute = createRoute({
  method: "get",
  operationId: "getTaskDescriptionPage",
  path: "/{id}/description",
  tags: ["Tasks"],
  summary: "Read a description page",
  middleware: [workspaceAccess.fromTaskId("id")] as const,
  request: { params: taskParam, query: descriptionPageQuery },
  responses: {
    200: jsonResponse("Description page", descriptionPageSchema),
    400: errorResponse("Invalid offset or version"),
    403: errorResponse("No access to the project"),
    404: errorResponse("Task not found"),
    409: errorResponse("Description changed; reload from offset zero"),
    503: errorResponse("Description request timed out"),
  },
});
const descriptionMatchesRoute = createRoute({
  method: "get",
  operationId: "findDeferredTaskDescriptions",
  path: "/description-matches/{projectId}",
  tags: ["Tasks"],
  summary: "Search descriptions omitted from task lists",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam, query: descriptionMatchesQuery },
  responses: {
    200: jsonResponse("Matching task IDs", descriptionMatchesSchema),
    400: errorResponse("Invalid search query or cursor"),
    403: errorResponse("No access to the project"),
    503: errorResponse("Description search timed out"),
    404: errorResponse("Project not found"),
  },
});

const task = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(featureLinkCandidatesRoute, async (c) =>
    c.json(
      await readFeatureLinkCandidates(
        c.req.valid("param").projectId,
        c.get("workspaceId"),
        c.req.valid("query"),
      ),
      200,
    ),
  )
  .openapi(descriptionPageRoute, async (c) =>
    c.json(
      await getDescriptionPage(c.req.valid("param").id, c.req.valid("query")),
      200,
    ),
  )
  .openapi(descriptionMatchesRoute, async (c) => {
    const { query, after } = c.req.valid("query");
    return c.json(
      await getDeferredDescriptionMatches(
        c.req.valid("param").projectId,
        query,
        after,
      ),
      200,
    );
  })
  // Registered ahead of the `/{id}` routes, which would otherwise claim it.
  .openapi(updateTaskMilestoneRoute, async (c) =>
    c.json(
      taskResource(
        await updateTaskMilestone({
          id: c.req.valid("param").id,
          milestoneId: c.req.valid("json").milestoneId,
          currentUserId: c.get("userId"),
          expectedProjectId: c.get("authorizedProjectId"),
          expectedWorkspaceId: c.get("workspaceId"),
        }),
      ),
      200,
    ),
  )
  .openapi(listAssignedTasksRoute, async (c) => {
    const { workspaceId, countOnly } = c.req.valid("query");
    return c.json(
      await getAssignedTasks(
        workspaceId,
        c.get("userId"),
        countOnly === "true",
      ),
      200,
    );
  })
  .openapi(featureLibraryRoute, async (c) =>
    c.json(
      await listFeatureLibrary(
        c.req.valid("param").projectId,
        c.req.valid("query"),
        c.get("workspaceId"),
      ),
      200,
    ),
  )
  .openapi(archiveFeatureRoute, async (c) =>
    c.json(
      taskResource(
        await archiveFeature(
          c.req.valid("param").id,
          c.req.valid("json").archived,
          c.get("userId"),
          c.get("authorizedProjectId"),
          c.get("workspaceId"),
        ),
      ),
      200,
    ),
  )
  .openapi(listProjectFeaturesRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    return c.json(await listProjectFeatures(projectId), 200);
  })
  .openapi(listTasksRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const filters = c.req.valid("query") || {};

    const tasks = await getTasks(projectId, filters, c.get("userId"));

    return c.json(tasks, 200);
  })
  .openapi(bulkUpdateTasksRoute, async (c) => {
    const { taskIds, operation, value } = c.req.valid("json");
    const userId = c.get("userId");

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    if (
      operation !== "delete" &&
      operation !== "updateDueDate" &&
      value === undefined
    ) {
      throw new HTTPException(400, {
        message: "Value is required for this operation",
      });
    }

    const result = await bulkUpdateTasks({
      taskIds,
      operation,
      value,
      userId,
    });

    return c.json(result, 200);
  })
  .openapi(stagedUploadRoute, async (c) =>
    c.json(
      await stageTaskAssetUpload(
        c.req.valid("param").projectId,
        c.get("userId"),
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .openapi(finalizeStagedUploadRoute, async (c) => {
    const asset = await finalizeStagedTaskAsset(
      c.req.valid("param").projectId,
      c.get("userId"),
      c.req.valid("json"),
    );
    const base = normalizeApiServerUrl(
      process.env.KANEO_API_URL || new URL(c.req.url).origin,
    );
    return c.json({ id: asset.id, url: `${base}/asset/${asset.id}` }, 200);
  })
  .openapi(reorderTasksRoute, async (c) => {
    const { projectId, tasks, expectedTasks } = c.req.valid("json");
    return c.json(
      await reorderTasks(projectId, tasks, c.get("userId"), expectedTasks),
      200,
    );
  })
  .openapi(createTaskRoute, async (c) => {
    const { projectId } = c.req.param();
    const {
      title,
      description,
      startDate,
      dueDate,
      priority,
      status,
      userId,
      customFields,
      draftAssetIds,
      type,
      featureId,
      milestoneId,
      releaseId,
      featureComposition,
    } = c.req.valid("json");

    const parsedStartDate =
      startDate !== undefined
        ? validateAndParseDate(startDate, "startDate")
        : undefined;
    const parsedDueDate =
      dueDate !== undefined
        ? validateAndParseDate(dueDate, "dueDate")
        : undefined;

    validateDateRange(parsedStartDate, parsedDueDate);

    const task = await createTask({
      projectId,
      currentUserId: c.get("userId"),
      userId: userId,
      title,
      description,
      startDate: parsedStartDate,
      dueDate: parsedDueDate,
      priority,
      status,
      customFields,
      draftAssetIds,
      type,
      featureId,
      milestoneId,
      expectedWorkspaceId: c.get("workspaceId"),
      releaseId,
      featureComposition,
    });

    return c.json(taskResource(task), 200);
  })
  .openapi(duplicateTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { title } = c.req.valid("json");
    return c.json(
      taskResource(
        await duplicateTask({
          taskId: id,
          title,
          currentUserId: c.get("userId"),
          expectedWorkspaceId: c.get("workspaceId"),
        }),
      ),
      200,
    );
  })
  .openapi(getTaskByTicketIdRoute, async (c) => {
    const { ticketId } = c.req.valid("param");
    return c.json(
      taskResource(
        await getTaskByTicketId(
          ticketId,
          c.get("userId"),
          c.req.valid("query"),
        ),
      ),
      200,
    );
  })
  .openapi(getTaskRoute, async (c) => {
    const { id } = c.req.valid("param");

    const task = await getTask(
      id,
      c.req.valid("query").view === "board",
      c.get("userId"),
    );

    return c.json(taskResource(task), 200);
  })
  .openapi(moveTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { destinationProjectId, destinationStatus } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const result = await moveTask({
      taskId: id,
      destinationProjectId,
      destinationStatus,
      currentUserId,
    });

    return c.json({ ...result, task: taskResource(result.task) }, 200);
  })
  .openapi(updateTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const {
      title,
      description,
      startDate,
      dueDate,
      priority,
      status,
      projectId,
      position,
      userId,
    } = c.req.valid("json");

    const currentUserId = c.get("userId");

    const parsedStartDate =
      startDate !== undefined
        ? validateAndParseDate(startDate, "startDate")
        : undefined;
    const parsedDueDate =
      dueDate !== undefined
        ? validateAndParseDate(dueDate, "dueDate")
        : undefined;

    validateDateRange(parsedStartDate, parsedDueDate);

    const task = await updateTask(
      id,
      title,
      status,
      parsedStartDate,
      parsedDueDate,
      projectId,
      description,
      priority,
      position,
      userId,
      currentUserId,
    );

    return c.json(taskResource(task), 200);
  })
  .openapi(exportTasksRoute, async (c) => {
    const { projectId } = c.req.valid("param");

    const exportData = await exportTasks(projectId, c.get("userId"));

    return c.json(exportData, 200);
  })
  .openapi(importTasksRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const document = c.req.valid("json");
    const currentUserId = c.get("userId");
    const hierarchy =
      Boolean(document.milestones?.length) ||
      document.tasks.some((task) => task.featureKey || task.milestoneKey);
    if (hierarchy && document.version !== 2 && document.version !== 3) {
      throw new HTTPException(400, {
        message: "Hierarchy imports require version 2 or 3",
      });
    }
    if (document.releases?.length)
      await requireWorkspacePermission({ project: ["update"] })(
        c,
        async () => {},
      );
    if (document.milestones?.some((milestone) => milestone.leadId))
      await requireWorkspacePermission({ task: ["assign"] })(c, async () => {});
    if (hierarchy) {
      await requireWorkspacePermission({ task: ["update"] })(c, async () => {});
    }
    if (
      (document.version === 2 || document.version === 3) &&
      document.tasks.some((task) => task.labels?.length)
    ) {
      await requireWorkspacePermission({ label: ["create", "update"] })(
        c,
        async () => {},
      );
    }
    const result =
      document.version === 2 || document.version === 3
        ? await importHierarchy(
            projectId,
            document,
            currentUserId,
            c.get("workspaceId"),
          )
        : await importTasks(projectId, document.tasks, currentUserId);

    return c.json(result, 200);
  })
  .openapi(deleteTaskRoute, async (c) => {
    const { id } = c.req.valid("param");

    const currentUserId = c.get("userId");
    const task = await deleteTask(id, currentUserId);

    return c.json(taskResource(task), 200);
  })
  .openapi(updateTaskStatusRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { status } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskStatus({ id, status, currentUserId });

    return c.json(taskResource(task), 200);
  })
  .openapi(updateTaskPriorityRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { priority } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskPriority({ id, priority, currentUserId });

    return c.json(taskResource(task), 200);
  })
  .openapi(updateTaskAssigneeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { userId } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskAssignee({ id, userId, currentUserId });

    return c.json(taskResource(task), 200);
  })
  .openapi(updateTaskDueDateRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { dueDate = null } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskDueDate({
      id,
      dueDate: dueDate ? validateAndParseDate(dueDate, "dueDate") : null,
      currentUserId,
    });

    return c.json(taskResource(task), 200);
  })
  .openapi(updateTaskTitleRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { title } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskTitle({ id, title, currentUserId });

    return c.json(taskResource(task), 200);
  })
  .openapi(updateTaskFeatureRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { featureId } = c.req.valid("json");
    const currentUserId = c.get("userId");

    return c.json(
      taskResource(await updateTaskFeature({ id, featureId, currentUserId })),
      200,
    );
  })
  .openapi(updateTaskReleaseRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { releaseId } = c.req.valid("json");
    const currentUserId = c.get("userId");

    return c.json(
      taskResource(await updateTaskRelease({ id, releaseId, currentUserId })),
      200,
    );
  })
  .openapi(updateTaskTypeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { type } = c.req.valid("json");
    const currentUserId = c.get("userId");

    return c.json(
      taskResource(await updateTaskType({ id, type, currentUserId })),
      200,
    );
  })
  .openapi(createTaskImageUploadRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { filename, contentType, size, surface } = c.req.valid("json");

    try {
      validateTaskAssetUploadInput(contentType, size);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error
            ? error.message
            : "Invalid image upload request",
      });
    }

    const [taskContext] = await db
      .select({
        taskId: taskTable.id,
        projectId: taskTable.projectId,
        workspaceId: workspaceTable.id,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        workspaceTable,
        eq(projectTable.workspaceId, workspaceTable.id),
      )
      .where(eq(taskTable.id, id))
      .limit(1);

    if (!taskContext) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    try {
      const upload = await createTaskImageUploadUrl({
        workspaceId: taskContext.workspaceId,
        projectId: taskContext.projectId,
        taskId: taskContext.taskId,
        surface,
        filename,
        contentType,
        size,
      });

      return c.json(upload, 200);
    } catch (error) {
      throw new HTTPException(503, {
        message:
          error instanceof Error
            ? error.message
            : "Image uploads are not configured",
      });
    }
  })
  .openapi(finalizeTaskImageUploadRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { key, filename, contentType, size, surface } = c.req.valid("json");
    const userId = c.get("userId");

    try {
      validateTaskAssetUploadInput(contentType, size);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error
            ? error.message
            : "Invalid image upload request",
      });
    }

    const [taskContext] = await db
      .select({
        taskId: taskTable.id,
        projectId: taskTable.projectId,
        workspaceId: workspaceTable.id,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        workspaceTable,
        eq(projectTable.workspaceId, workspaceTable.id),
      )
      .where(eq(taskTable.id, id))
      .limit(1);

    if (!taskContext) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    const normalizedKey = key.trim();
    if (
      !assertTaskImageKeyMatchesContext(normalizedKey, {
        workspaceId: taskContext.workspaceId,
        projectId: taskContext.projectId,
        taskId: taskContext.taskId,
        surface,
      })
    ) {
      throw new HTTPException(400, {
        message: "Image upload key does not match the task context.",
      });
    }

    const asset = await withVerifiedStorageObject(
      normalizedKey,
      async () => {
        try {
          return await verifyTaskAssetUpload(normalizedKey, {
            size,
            contentType,
          });
        } catch (error) {
          throw new HTTPException(
            error instanceof InvalidUploadedAssetError ? 400 : 503,
            {
              message:
                error instanceof InvalidUploadedAssetError
                  ? error.message
                  : "Unable to verify uploaded object.",
            },
          );
        }
      },
      async (db, uploaded) => {
        const [existingAsset] = await db
          .select({ id: assetTable.id })
          .from(assetTable)
          .where(eq(assetTable.objectKey, normalizedKey))
          .limit(1);

        const [saved] = existingAsset
          ? await db
              .update(assetTable)
              .set({
                workspaceId: taskContext.workspaceId,
                projectId: taskContext.projectId,
                taskId: taskContext.taskId,
                filename,
                mimeType: uploaded.contentType,
                size: uploaded.size,
                kind: isImageContentType(uploaded.contentType)
                  ? "image"
                  : "attachment",
                surface,
                createdBy: userId || null,
              })
              .where(eq(assetTable.id, existingAsset.id))
              .returning({
                id: assetTable.id,
              })
          : await db
              .insert(assetTable)
              .values({
                workspaceId: taskContext.workspaceId,
                projectId: taskContext.projectId,
                taskId: taskContext.taskId,
                objectKey: normalizedKey,
                filename,
                mimeType: uploaded.contentType,
                size: uploaded.size,
                kind: isImageContentType(uploaded.contentType)
                  ? "image"
                  : "attachment",
                surface,
                createdBy: userId || null,
              })
              .returning({
                id: assetTable.id,
              });

        return saved;
      },
    );

    if (!asset) {
      throw new HTTPException(500, {
        message: "Failed to save asset",
      });
    }

    const apiBaseUrl = normalizeApiServerUrl(
      process.env.KANEO_API_URL || new URL(c.req.url).origin,
    );
    return c.json(
      {
        id: asset.id,
        url: `${apiBaseUrl}/asset/${asset.id}`,
      },
      200,
    );
  })
  .openapi(updateTaskDescriptionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { description } = c.req.valid("json");
    const currentUserId = c.get("userId");

    const task = await updateTaskDescription({
      id,
      description,
      currentUserId,
    });

    return c.json(taskResource(task), 200);
  });

export default task;
