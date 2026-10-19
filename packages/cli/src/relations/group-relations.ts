import type {
  RelatedTask,
  TaskRelationWithTasks,
} from "../api/task-relations.js";
import { taskUrl } from "../render/links.js";
import { ticketId } from "../render/task-format.js";
import {
  perspectiveOf,
  type RelationDirection,
  relationOrder,
} from "./relation-types.js";

export type RelatedTaskJson = {
  readonly id: string;
  readonly type?: string;
  readonly ticketId: string | null;
  readonly title: string;
  readonly status: string;
  readonly completed: boolean;
  readonly url: string;
};

export type RelationJson = {
  readonly type: string;
  readonly direction: RelationDirection;
  readonly task: RelatedTaskJson;
};

// A task's feature, a feature's tasks, and the other links. Feature links
// come from the relation listing as "subtask" entries.
export type RelationsJson = {
  readonly feature: RelatedTaskJson | null;
  readonly tasks: ReadonlyArray<RelatedTaskJson>;
  readonly relations: ReadonlyArray<RelationJson>;
};

export type TaskContext = {
  readonly projectSlugs: ReadonlyMap<string, string>;
  readonly workspaceId: string;
  readonly webUrl: string;
};

export function relatedTaskJson(
  task: RelatedTask,
  context: TaskContext,
): RelatedTaskJson {
  const slug = context.projectSlugs.get(task.projectId);
  return {
    id: task.id,
    ...(task.type === undefined ? {} : { type: task.type }),
    ticketId: slug ? ticketId(slug, task.number) : null,
    title: task.title,
    status: task.status,
    completed: task.isCompleted,
    url: taskUrl(context.webUrl, {
      workspaceId: context.workspaceId,
      projectId: task.projectId,
      id: task.id,
    }),
  };
}

function byTicket(a: RelatedTaskJson, b: RelatedTaskJson): number {
  return (a.ticketId ?? a.title).localeCompare(b.ticketId ?? b.title, "en", {
    numeric: true,
  });
}

export function groupRelations(
  relations: ReadonlyArray<TaskRelationWithTasks>,
  taskId: string,
  context: TaskContext,
): RelationsJson {
  let feature: RelatedTaskJson | null = null;
  const tasks: RelatedTaskJson[] = [];
  const others: RelationJson[] = [];
  for (const relation of relations) {
    const outgoing = relation.sourceTaskId === taskId;
    const linked = outgoing ? relation.targetTask : relation.sourceTask;
    if (!linked || linked.id === taskId) continue;
    const task = relatedTaskJson(linked, context);
    const perspective = perspectiveOf(relation, taskId);
    if (perspective.type === "parent-of") tasks.push(task);
    // A task belongs to at most one feature.
    else if (perspective.type === "subtask-of") feature = task;
    else others.push({ ...perspective, task });
  }
  return {
    feature,
    tasks: tasks.sort(byTicket),
    relations: others.sort(
      (a, b) =>
        relationOrder(a.type) - relationOrder(b.type) ||
        a.type.localeCompare(b.type) ||
        byTicket(a.task, b.task),
    ),
  };
}

export function relationsBetween(
  relations: ReadonlyArray<TaskRelationWithTasks>,
  taskId: string,
  otherId: string,
  type: string | undefined,
): TaskRelationWithTasks[] {
  return relations.filter((relation) => {
    const linked =
      (relation.sourceTaskId === taskId && relation.targetTaskId === otherId) ||
      (relation.sourceTaskId === otherId && relation.targetTaskId === taskId);
    return (
      linked &&
      (type === undefined || perspectiveOf(relation, taskId).type === type)
    );
  });
}
