import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import { TASK_TYPES } from "./task-type";
import {
  planningSnapshotSchema,
  transferReleaseSchema,
  exportedMilestoneSchema,
} from "./transfers/schema";

const priorityDescription = "One of: no-priority, low, medium, high, urgent.";

export const taskTypeSchema = z.enum(TASK_TYPES).openapi({
  description:
    "A feature groups tasks and bugs of its own project. A task or bug can belong to one feature.",
});

const featureIdSchema = z.string().nullable().openapi({
  description:
    "The feature this task or bug belongs to, in the same project. Always null for a feature.",
});

const milestoneIdSchema = z.string().nullable().openapi({
  description:
    "A milestone within this task or bug’s Feature. Null for Features and unassigned items.",
});

const releaseIdSchema = z.string().nullable().openapi({
  description:
    "The Task/Bug release, from its own project. Always null for Features and on public boards.",
});

const taskBaseSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    position: z.number().nullable().openapi({
      description: "Order within its column, ascending.",
    }),
    number: z.number().nullable().openapi({
      description: "Per-project counter shown as {projectSlug}-{number}.",
    }),
    userId: z
      .string()
      .nullable()
      .openapi({ description: "The assignee, if any." }),
    title: z.string(),
    description: z.string().nullable(),
    descriptionDeferred: z.boolean().optional().openapi({
      description:
        "True when the list omits a large description; load the task detail or description pages to read it. Do not replace stored text with this null summary.",
    }),
    status: z.string().nullable().openapi({
      description: "The slug of the column the task sits in.",
    }),
    priority: z
      .string()
      .nullable()
      .openapi({ description: priorityDescription }),
    startDate: nullableResponseTimestamp,
    dueDate: nullableResponseTimestamp,
    archivedAt: nullableResponseTimestamp,
    createdAt: responseTimestamp,
    type: taskTypeSchema,
    featureId: featureIdSchema,
    milestoneId: milestoneIdSchema,
    releaseId: releaseIdSchema,
    customFields: z
      .array(z.object({ fieldId: z.string(), value: z.string() }))
      .optional(),
  })
  .openapi("Task");

export const featureKnowledgeSchema = taskBaseSchema
  .extend({
    type: z.literal("feature"),
    status: z.null(),
    priority: z.null(),
    columnId: z.null(),
    userId: z.null(),
    startDate: z.null(),
    dueDate: z.null(),
    releaseId: z.null(),
    featureId: z.null(),
    milestoneId: z.null(),
  })
  .openapi("FeatureKnowledge");
export const leafTaskSchema = taskBaseSchema
  .extend({
    type: z.enum(["task", "bug"]),
    status: z.string(),
    priority: z.string(),
    archivedAt: z.null(),
    columnId: z.string().nullable(),
  })
  .openapi("LeafTask");

export const taskSchema = z
  .discriminatedUnion("type", [featureKnowledgeSchema, leafTaskSchema])
  .openapi("TaskResource");
const taskReleaseFields = {
  movedTaskIds: z.array(z.string()).openapi({
    description: "Always empty; milestone release writes handle followers.",
  }),
};
export const taskReleaseResultSchema = z
  .discriminatedUnion("type", [
    featureKnowledgeSchema.extend(taskReleaseFields),
    leafTaskSchema.extend(taskReleaseFields),
  ])
  .openapi("TaskReleaseResult");
const taskReadFields = {
  workspaceId: z.string().optional().openapi({
    description:
      "The workspace currently owning the task's project. Included in the detail view; omitted from the compact board view.",
  }),
  subtaskCounts: z
    .object({ completed: z.number(), total: z.number() })
    .optional()
    .openapi({
      description:
        "For a feature, its tasks and bugs and how many are in a final column. Zero for a task or bug.",
    }),
  parentSubtaskCounts: z
    .array(
      z.object({
        taskId: z.string(),
        completed: z.number(),
        total: z.number(),
      }),
    )
    .optional()
    .openapi({
      description:
        "The progress of the task's feature (at most one entry), so a board can update the feature's card.",
    }),
  assigneeName: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeImage: z.string().nullable(),
};
export const taskWithAssigneeSchema = z
  .discriminatedUnion("type", [
    featureKnowledgeSchema.extend(taskReadFields),
    leafTaskSchema.extend(taskReadFields),
  ])
  .openapi("TaskWithAssignee");
const ticketReadFields = {
  ...taskReadFields,
  workspaceId: z
    .string()
    .openapi({ description: "The workspace that owns the task's project." }),
};
export const taskByTicketIdSchema = z
  .discriminatedUnion("type", [
    featureKnowledgeSchema.extend(ticketReadFields),
    leafTaskSchema.extend(ticketReadFields),
  ])
  .openapi("TaskByTicketId");

const taskLabelSchema = z
  .object({ id: z.string(), name: z.string(), color: z.string() })
  .openapi("TaskLabel");

const taskExternalLinkSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    integrationId: z.string().nullable(),
    resourceType: z.string(),
    externalId: z.string(),
    url: z.string(),
    title: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable().openapi({
      description:
        "Provider-specific payload, already parsed from the stored JSON string.",
    }),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("TaskExternalLink");

export const projectFeatureListSchema = z
  .array(
    z.object({
      id: z.string(),
      title: z.string(),
      number: z.number().nullable(),
      status: z.string().nullable().openapi({
        description:
          "Always null: Features are knowledge records without workflow status.",
      }),
      releaseId: releaseIdSchema,
      archivedAt: nullableResponseTimestamp,
    }),
  )
  .openapi("ProjectFeatureList");

export const boardTaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    number: z.number().nullable(),
    description: z.string().nullable(),
    descriptionDeferred: z.boolean().optional().openapi({
      description:
        "True when the list omits a large description; load the task detail or description pages to read it. Do not replace stored text with this null summary.",
    }),
    status: z.string(),
    priority: z.string().openapi({ description: priorityDescription }),
    startDate: nullableResponseTimestamp,
    dueDate: nullableResponseTimestamp,
    position: z.number().nullable(),
    createdAt: responseTimestamp,
    userId: z.string().nullable(),
    assigneeName: z.string().nullable(),
    assigneeId: z.string().nullable(),
    assigneeImage: z.string().nullable(),
    projectId: z.string(),
    type: taskTypeSchema,
    featureId: featureIdSchema,
    milestoneId: milestoneIdSchema,
    releaseId: releaseIdSchema,
    subtaskCounts: z
      .object({
        completed: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .openapi({
        description:
          "For a feature, its tasks and bugs and how many are in a final column; zero for a task or bug. Counts all members, whatever the board's filters.",
      }),
    labels: z.array(taskLabelSchema),
    externalLinks: z.array(taskExternalLinkSchema),
  })
  .openapi("BoardTask");

export const boardColumnSchema = z
  .object({
    id: z.string().openapi({ description: "The column slug, same as `slug`." }),
    slug: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    isFinal: z.boolean(),
    position: z.number().optional(),
    tasks: z.array(boardTaskSchema),
  })
  .openapi("BoardColumn");

export const boardSchema = z
  .object({
    data: z
      .object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        icon: z.string().nullable(),
        description: z.string().nullable(),
        descriptionDeferred: z.boolean().optional().openapi({
          description:
            "True when a project description above 64 KiB is omitted; use project detail or public project description pages for full text.",
        }),
        isPublic: z.boolean().nullable(),
        workspaceId: z.string(),
        backgroundVersion: z.string().nullable(),
        columns: z.array(boardColumnSchema),
        archivedTasks: z.array(boardTaskSchema),
        plannedTasks: z.array(boardTaskSchema),
      })
      .openapi("Board"),
    pagination: z
      .object({
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
        totalPages: z.number(),
        relatedPage: z.number(),
        relatedPageSize: z.number(),
        relatedTotalPages: z.number(),
        relatedRevision: z.string().optional().openapi({
          description:
            "Public board labels and external links revision for this task page. Restart pagination if it changes during related-page continuations.",
        }),
        revision: z.string().optional().openapi({
          description:
            "Public board content, membership and ordering revision, including related records and feature progress. Restart pagination if it changes between task or related pages.",
        }),
      })
      .openapi({
        description:
          "Always paginated: 50 tasks by default, at most 100 per page. Continue through totalPages to retrieve all tasks. For each task page, follow relatedPage through relatedTotalPages to retrieve all labels, external links and columns (100 related rows per kind per request, plus up to 100 columns needed to represent the tasks).",
      })
      .openapi("BoardPagination"),
  })
  .openapi("BoardResponse");

export const bulkResultSchema = z
  .object({ success: z.boolean(), updatedCount: z.number() })
  .openapi("BulkTaskResult");

export const moveTaskResultSchema = z
  .object({
    task: taskSchema,
    sourceProjectId: z.string(),
    destinationProjectId: z.string(),
  })
  .openapi("MoveTaskResult");

export const taskExportSchema = z
  .object({
    version: z.literal(3),
    releases: z.array(transferReleaseSchema),
    milestones: z.array(exportedMilestoneSchema),
    project: z
      .object({
        name: z.string(),
        slug: z.string(),
        description: z.string().nullable(),
        exportedAt: z.string().openapi({ format: "date-time" }),
      })
      .openapi("TaskExportProject"),
    tasks: z.array(
      z
        .object({
          key: z.string(),
          featureKey: z.string().nullable(),
          milestoneKey: z.string().nullable(),
          releaseKey: z.string().nullable(),
          archivedAt: z.string().nullable(),
          planningSnapshots: z.array(planningSnapshotSchema),
          title: z.string(),
          type: taskTypeSchema,
          description: z.string(),
          status: z.string().nullable(),
          priority: z.string().nullable(),
          dueDate: z.string().nullable().openapi({ format: "date-time" }),
          startDate: z.string().nullable().openapi({ format: "date-time" }),
          userId: z.string().nullable(),
          labels: z
            .array(
              z
                .object({ name: z.string(), color: z.string() })
                .openapi("ExportedTaskLabel"),
            )
            .openapi({
              description: "Label names and colors, without their ids.",
            }),
        })
        .openapi("ExportedTask"),
    ),
  })
  .openapi("TaskExport");

export const taskImportResultSchema = z
  .object({
    results: z
      .object({
        total: z.number(),
        successful: z.number(),
        failed: z.number(),
        tasks: z.array(z.unknown()).openapi({
          description: "Per-task outcome, each carrying a success flag.",
        }),
      })
      .openapi("TaskImportSummary"),
  })
  .openapi("TaskImportResult");

export const imageUploadSchema = z
  .object({
    key: z.string().openapi({
      description: "Object key to send back to the finalize route.",
    }),
    uploadUrl: z.string().openapi({
      description: "Presigned URL to PUT the image bytes to.",
    }),
    headers: z.record(z.string(), z.string()).openapi({
      description:
        "Headers that must accompany the upload request, including Content-Type.",
    }),
  })
  .openapi("TaskImageUpload");

export const finalizedAssetSchema = z
  .object({
    id: z.string(),
    url: z.string().openapi({
      description: "Where the stored image can be read back from.",
    }),
  })
  .openapi("TaskImageAsset");

export const descriptionPageSchema = z
  .object({
    content: z.string(),
    version: z.string(),
    nextOffset: z.number().nullable(),
  })
  .openapi("TaskDescriptionPage");
export const descriptionMatchesSchema = z
  .object({ ids: z.array(z.string()), nextCursor: z.string().nullable() })
  .openapi("TaskDescriptionMatches");

export const assignedTasksSchema = z
  .object({
    tasks: z.array(
      z
        .object({
          id: z.string(),
          projectId: z.string(),
          number: z.number().nullable(),
          title: z.string(),
          type: taskTypeSchema,
          milestoneId: milestoneIdSchema,
          status: z.string().openapi({
            description: "The slug of the column the task sits in.",
          }),
          statusName: z.string().nullable().openapi({
            description:
              "The column's display name. Null for tasks outside a column, such as planned ones.",
          }),
          statusIcon: z.string().nullable(),
          priority: z.string().openapi({ description: priorityDescription }),
          dueDate: nullableResponseTimestamp,
          projectName: z.string(),
          projectSlug: z.string(),
          projectIcon: z.string().nullable(),
          labels: z.array(taskLabelSchema),
        })
        .openapi("AssignedTask"),
    ),
    total: z.number().openapi({
      description:
        "All open tasks assigned to the caller, including any beyond the first 100 returned.",
    }),
  })
  .openapi("AssignedTasks");
