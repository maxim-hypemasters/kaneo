import type db from "../../database";
import { activityTable, projectTable, taskTable } from "../../database/schema";
import { preserveImportedPlanning } from "../../task/transfers/feature-planning";
import { eq } from "drizzle-orm";
import {
  importedTaskDates,
  preserveImportedSchedule,
} from "../../task/transfers/task-schedule";
import { chunk } from "./chunk";
import type { PlannedImportTask } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeImportTasks(
  tx: Transaction,
  projectId: string,
  importedBy: string,
  tasks: readonly PlannedImportTask[],
  releases: ReadonlyMap<string, string> = new Map(),
) {
  const [project] = await tx
    .select({ scheduleGeneration: projectTable.scheduleGeneration })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .for("update");
  if (!project) throw new Error("Project changed during import");
  for (const batch of chunk(tasks)) {
    await tx.insert(taskTable).values(
      batch.map((task) => ({
        id: task.id,
        type: task.type,
        projectId,
        number: task.number,
        title: task.title,
        description: task.description,
        status: task.type === "feature" ? null : task.status,
        columnId: task.type === "feature" ? null : task.columnId,
        position: task.position,
        priority: task.type === "feature" ? null : task.priority,
        ...(task.type === "feature"
          ? {}
          : importedTaskDates(
              {
                legacyStartDate: task.legacyStartDate?.toISOString() ?? null,
                legacyDueDate: task.legacyDueDate?.toISOString() ?? null,
              },
              project.scheduleGeneration,
            )),
        estimateSeconds: task.type === "feature" ? null : task.estimateSeconds,
        createdAt: task.createdAt,
        userId: task.type === "feature" ? null : task.userId,
        archivedAt:
          task.type === "feature" &&
          (task.archivedAt || task.status === "archived")
            ? new Date(task.archivedAt ?? new Date().toISOString())
            : null,
        releaseId:
          task.type !== "feature" && task.releaseKey
            ? (releases.get(task.releaseKey) ?? null)
            : null,
      })),
    );

    for (const task of batch.filter((task) => task.type === "feature"))
      await preserveImportedPlanning(
        tx,
        task.id,
        importedBy,
        task.legacyPlanning ?? {},
        task.planningSnapshots,
        releases,
      );

    for (const task of batch.filter((task) => task.type !== "feature"))
      await preserveImportedSchedule(tx, projectId, task.id, importedBy, {
        legacyStartDate: task.legacyStartDate?.toISOString() ?? null,
        legacyDueDate: task.legacyDueDate?.toISOString() ?? null,
        scheduleSnapshots: task.scheduleSnapshots,
      });

    await tx.insert(activityTable).values(
      batch.map((task) => ({
        taskId: task.id,
        type: "created",
        userId: importedBy,
        content: null,
        eventData: {},
        createdAt: task.createdAt,
      })),
    );
  }
}
