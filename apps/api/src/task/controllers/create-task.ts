import db from "../../database";
import { HTTPException } from "hono/http-exception";
import { publishEvent } from "../../events";
import { retryTransaction } from "../../utils/retry-transaction";
import { publishFeatureChange } from "../feature-hierarchy/publish-feature-change";
import {
  createTaskInTransaction,
  type CreateTaskInput,
} from "./create-task-in-transaction";
import { createFeatureCompositionInTransaction } from "./create-feature-composition-in-transaction";
import {
  featureCompositionSchema,
  type FeatureCompositionInput,
} from "../feature-composition-schema";

async function createTask(
  input: CreateTaskInput & { featureComposition?: FeatureCompositionInput },
) {
  const parsed =
    input.featureComposition === undefined
      ? undefined
      : featureCompositionSchema.safeParse(input.featureComposition);
  if (parsed && (!parsed.success || input.type !== "feature"))
    throw new HTTPException(400, {
      message: "Invalid Feature creation drafts",
    });
  const composition = parsed?.success ? parsed.data : undefined;
  const { task, assigneeName, graph } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const result = await createTaskInTransaction(tx, input);
      return {
        ...result,
        graph: composition
          ? await createFeatureCompositionInTransaction(
              tx,
              result.task,
              composition,
              input.currentUserId,
              input.expectedWorkspaceId,
            )
          : null,
      };
    }),
  );
  for (const created of [task, ...(graph?.createdTasks ?? [])])
    await publishEvent("task.created", {
      ...created,
      taskId: created.id,
      userId: created.userId ?? "",
      currentUserId: input.currentUserId,
      type: "created",
      content: null,
    });
  if (graph) {
    for (const milestone of graph.milestones)
      await publishEvent("milestone.changed", {
        projectId: task.projectId,
        featureId: task.id,
        milestoneId: milestone.id,
        userId: input.currentUserId,
      });
    if (graph.linkedTaskIds.length || graph.createdTasks.length)
      await publishFeatureChange({
        projectId: task.projectId,
        featureIds: [task.id, ...graph.linkedTaskIds],
        userId: input.currentUserId,
      });
  }
  if (task.featureId) {
    await publishFeatureChange({
      projectId: task.projectId,
      featureIds: [task.featureId],
      userId: input.currentUserId,
    });
  }
  return { ...task, assigneeName };
}

export default createTask;
