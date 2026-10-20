import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import {
  filterAssignableUsers,
  NO_PROJECT_ACCESS,
  NOT_ASSIGNABLE,
} from "../../utils/assert-assignable-user";
import {
  coercePriority,
  coerceStatus,
  getValidTaskStatuses,
} from "../validate-task-fields";
import { claimTaskNumber } from "./claim-task-numbers";
import { preserveImportedPlanning } from "../transfers/feature-planning";
import { nextTaskPosition } from "./next-task-position";
import type { TaskType } from "../task-type";

export type ImportTask = {
  title: string;
  type?: TaskType;
  description?: string;
  status?: string | null;
  priority?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  userId?: string | null;
};

async function importTasks(
  projectId: string,
  tasksToImport: ImportTask[],
  currentUserId?: string,
) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  const assigneeIds = [
    ...new Set(
      tasksToImport
        .map((task) => task.userId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const memberIds = await filterAssignableUsers(
    assigneeIds,
    project.workspaceId,
  );
  const assignableIds = await filterUsersWithProjectAccess(
    memberIds,
    projectId,
  );

  const validStatuses = await getValidTaskStatuses(projectId);

  const results = [];

  for (const taskData of tasksToImport) {
    const assigneeId = taskData.userId?.trim() || null;

    if (
      taskData.type !== "feature" &&
      assigneeId &&
      !assignableIds.has(assigneeId)
    ) {
      results.push({
        success: false,
        error: memberIds.has(assigneeId) ? NO_PROJECT_ACCESS : NOT_ASSIGNABLE,
        task: taskData,
      });
      continue;
    }

    try {
      const { status, warning: statusWarning } = coerceStatus(
        taskData.status ?? "planned",
        validStatuses,
      );
      const { priority, warning: priorityWarning } = coercePriority(
        taskData.priority || "low",
      );
      const warnings = [statusWarning, priorityWarning].filter(Boolean);

      const column = await db.query.columnTable.findFirst({
        where: and(
          eq(columnTable.projectId, projectId),
          eq(columnTable.slug, status),
        ),
      });

      const createdTask = await db.transaction(async (tx) => {
        const taskNumber = await claimTaskNumber(projectId, tx);
        const position = await nextTaskPosition(
          tx,
          projectId,
          status,
          column?.id ?? null,
        );

        const [task] = await tx
          .insert(taskTable)
          .values({
            projectId,
            userId: taskData.type === "feature" ? null : assigneeId,
            title: taskData.title,
            type: taskData.type ?? "task",
            status: taskData.type === "feature" ? null : status,
            columnId: taskData.type === "feature" ? null : (column?.id ?? null),
            startDate:
              taskData.type !== "feature" && taskData.startDate
                ? new Date(taskData.startDate)
                : null,
            dueDate:
              taskData.type !== "feature" && taskData.dueDate
                ? new Date(taskData.dueDate)
                : null,
            description: taskData.description || "",
            priority: taskData.type === "feature" ? null : priority,
            archivedAt:
              taskData.type === "feature" && taskData.status === "archived"
                ? new Date()
                : null,
            number: taskNumber,
            position,
          })
          .returning();

        if (taskData.type === "feature" && task)
          await preserveImportedPlanning(tx, task.id, currentUserId, taskData);
        return task;
      });

      if (createdTask) {
        await publishEvent("task.created", {
          ...createdTask,
          taskId: createdTask.id,
          userId: createdTask.userId ?? "",
          currentUserId: currentUserId ?? "",
          type: "create",
          content: "imported the task",
        });

        results.push({
          success: true,
          task: createdTask,
          ...(warnings.length > 0 && { warnings }),
        });
      } else {
        results.push({
          success: false,
          error: "Failed to create task",
          task: taskData,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        task: taskData,
      });
    }
  }

  return {
    importedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
    },
    results: {
      total: tasksToImport.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      tasks: results,
    },
  };
}

export default importTasks;
