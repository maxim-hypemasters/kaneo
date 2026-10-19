import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import type { ImportedProject } from "@kaneo/importers";
import type db from "../../database";
import { milestoneTable, taskTable } from "../../database/schema";
import { planTransferHierarchy } from "../../task/transfers/hierarchy";
import type { PlannedImportTask } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeImportMilestones(
  tx: Transaction,
  project: ImportedProject,
  tasks: readonly PlannedImportTask[],
  legacyMemberships: ReadonlyMap<string, string>,
) {
  const keyById = new Map(tasks.map((task) => [task.id, task.key]));
  const ids = new Map(tasks.map((task) => [task.key, task.id]));
  const legacy = new Map(
    [...legacyMemberships].map(([taskId, featureId]) => [
      keyById.get(taskId)!,
      keyById.get(featureId)!,
    ]),
  );
  // Legacy hierarchy planning may promote an imported parent to Feature.
  const owners = new Set(legacy.values());
  const plan = planTransferHierarchy(
    project.tasks.map((task) => ({
      ...task,
      type: owners.has(task.key) ? "feature" : task.type,
    })),
    project.milestones ?? [],
    legacy,
  );
  for (const task of tasks) {
    const featureKey = plan.memberships.get(task.key);
    await tx
      .update(taskTable)
      .set({ featureId: featureKey ? ids.get(featureKey)! : null })
      .where(eq(taskTable.id, task.id));
  }
  const milestones = new Map<string, string>();
  for (const item of plan.milestones) {
    const id = createId();
    await tx.insert(milestoneTable).values({
      id,
      featureId: ids.get(item.featureKey)!,
      title: item.title,
      description: item.description ?? null,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      position: item.position,
    });
    milestones.set(item.key, id);
  }
  for (const [taskKey, milestoneKey] of plan.links) {
    await tx
      .update(taskTable)
      .set({ milestoneId: milestones.get(milestoneKey)! })
      .where(eq(taskTable.id, ids.get(taskKey)!));
  }
  return plan.memberships.size;
}
