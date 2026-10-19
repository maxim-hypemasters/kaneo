import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
export type MilestoneCandidate = {
  id: string;
  title: string;
  number: number | null;
  type: "task" | "bug";
  milestoneId: string | null;
};
export type MilestoneCandidates = {
  projectSlug: string;
  tasks: MilestoneCandidate[];
};
// Unassigned canonical Feature leaves include unknown/deleted-column
// statuses that a board representation cannot place. This summary read is
// independent of board display filters and pagination.
export async function getMilestoneCandidates(
  projectId: string,
  featureId: string,
  signal?: AbortSignal,
): Promise<MilestoneCandidates> {
  signal?.throwIfAborted();
  const [relationsResponse, projectResponse] = await Promise.all([
    client["task-relation"][":taskId"].$get(
      { param: { taskId: featureId } },
      { init: { signal } },
    ),
    client.project[":id"].$get(
      { param: { id: projectId } },
      { init: { signal } },
    ),
  ]);
  if (!relationsResponse.ok)
    throw await HttpError.fromResponse(relationsResponse);
  if (!projectResponse.ok) throw await HttpError.fromResponse(projectResponse);
  const [relations, project] = await Promise.all([
    relationsResponse.json(),
    projectResponse.json(),
  ]);
  signal?.throwIfAborted();
  const tasks = new Map<string, MilestoneCandidate>();
  for (const relation of relations) {
    const task = relation.targetTask;
    if (
      relation.relationType !== "subtask" ||
      relation.sourceTaskId !== featureId ||
      !task ||
      relation.id !== `feature:${task.id}:${featureId}` ||
      task.projectId !== projectId ||
      task.milestoneId !== null ||
      (task.type !== "task" && task.type !== "bug")
    )
      continue;
    tasks.set(task.id, {
      id: task.id,
      title: task.title,
      number: task.number,
      type: task.type,
      milestoneId: task.milestoneId,
    });
  }
  return {
    projectSlug: project.slug,
    tasks: [...tasks.values()].sort(
      (a, b) =>
        (a.number ?? Infinity) - (b.number ?? Infinity) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    ),
  };
}
