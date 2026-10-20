import type { ReleaseMilestone } from "@/fetchers/release/get-release-milestones";
import type Task from "@/types/task";

export type ReleaseMilestoneMetadata = Pick<
  ReleaseMilestone,
  "id" | "featureId" | "title" | "position"
> &
  Partial<Omit<ReleaseMilestone, "id" | "featureId" | "title" | "position">>;

export type ReleaseWorkProgress = {
  total: number;
  started: number;
  completed: number;
};

export type ReleaseMilestoneGroup = {
  milestone: ReleaseMilestoneMetadata | null;
  tasks: Task[];
};

export function getReleaseWorkProgress(
  tasks: readonly Task[],
  done: ReadonlySet<string>,
  started: ReadonlySet<string>,
): ReleaseWorkProgress {
  const progress = { total: 0, started: 0, completed: 0 };
  for (const task of tasks) {
    if (task.status === "archived" || task.type === "feature") continue;
    progress.total += 1;
    if (done.has(task.status ?? "")) {
      progress.completed += 1;
      progress.started += 1;
    } else if (started.has(task.status ?? "")) progress.started += 1;
  }
  return progress;
}

// null means retain the flat list until definitions and task assignments agree.
export function groupReleaseMilestones(
  tasks: readonly Task[],
  milestones: readonly ReleaseMilestoneMetadata[] | undefined,
  releaseId?: string,
): ReleaseMilestoneGroup[] | null {
  if (!milestones?.length) return null;
  const grouped = new Map<string, Task[]>();
  for (const milestone of milestones) grouped.set(milestone.id, []);
  const unassigned: Task[] = [];
  for (const task of tasks) {
    if (task.status === "archived" || task.type === "feature") continue;
    if (!task.milestoneId) unassigned.push(task);
    else {
      const milestoneTasks = grouped.get(task.milestoneId);
      if (!milestoneTasks) return null;
      milestoneTasks.push(task);
    }
  }
  const groups: ReleaseMilestoneGroup[] = [...milestones]
    .sort(
      (left, right) =>
        left.position - right.position || left.id.localeCompare(right.id),
    )
    .flatMap((milestone) => {
      const milestoneTasks = grouped.get(milestone.id)!;
      return milestoneTasks.length > 0 ||
        (releaseId !== undefined && milestone.releaseId === releaseId)
        ? [{ milestone, tasks: milestoneTasks }]
        : [];
    });
  if (unassigned.length > 0)
    groups.push({ milestone: null, tasks: unassigned });
  return groups;
}
