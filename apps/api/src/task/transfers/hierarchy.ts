import { HTTPException } from "hono/http-exception";
import { isCalendarDay } from "../../release/release-dates";
import type { TaskType } from "../task-type";

export type HierarchyItem = {
  key: string;
  type?: TaskType;
  featureKey?: string | null;
  milestoneKey?: string | null;
};

export type TransferMilestone = {
  key: string;
  featureKey: string;
  title: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetDate?: string | null;
  position: number;
};

function invalid(message: string): never {
  throw new HTTPException(400, { message });
}

// Source keys are document-local references, never destination database IDs.
export function planTransferHierarchy(
  tasks: readonly HierarchyItem[],
  milestones: readonly TransferMilestone[],
  legacyMemberships: ReadonlyMap<string, string> = new Map(),
) {
  const items = new Map<string, HierarchyItem>();
  for (const task of tasks) {
    if (!task.key.trim() || items.has(task.key)) {
      invalid("Task transfer keys must be nonempty and unique");
    }
    items.set(task.key, task);
  }
  const memberships = new Map<string, string>();
  for (const task of tasks) {
    const featureKey =
      task.featureKey === undefined
        ? legacyMemberships.get(task.key)
        : task.featureKey;
    if (!featureKey) continue;
    if (
      task.type === "feature" ||
      featureKey === task.key ||
      items.get(featureKey)?.type !== "feature"
    ) {
      invalid("A task or bug must reference a Feature in the same transfer");
    }
    memberships.set(task.key, featureKey);
  }
  const definitions = new Map<string, TransferMilestone>();
  for (const milestone of milestones) {
    if (!milestone.key.trim() || definitions.has(milestone.key)) {
      invalid("Milestone transfer keys must be nonempty and unique");
    }
    if (items.get(milestone.featureKey)?.type !== "feature") {
      invalid("A milestone must reference a Feature in the same transfer");
    }
    const title = milestone.title.trim();
    const startDate = milestone.startDate ?? null;
    const endDate =
      milestone.endDate === undefined
        ? (milestone.targetDate ?? null)
        : milestone.endDate;
    if (
      title.length < 1 ||
      title.length > 255 ||
      (milestone.description?.length ?? 0) > 10_000 ||
      (startDate != null && !isCalendarDay(startDate)) ||
      (endDate != null && !isCalendarDay(endDate)) ||
      (startDate != null && endDate != null && startDate > endDate) ||
      !Number.isInteger(milestone.position) ||
      milestone.position < 0 ||
      milestone.position > 2_147_483_646
    ) {
      invalid("Invalid milestone title, description, date range or position");
    }
    const { targetDate: _legacyTargetDate, ...fields } = milestone;
    definitions.set(milestone.key, { ...fields, title, startDate, endDate });
  }
  const links = new Map<string, string>();
  for (const task of tasks) {
    if (!task.milestoneKey) continue;
    const milestone = definitions.get(task.milestoneKey);
    if (
      task.type === "feature" ||
      !milestone ||
      memberships.get(task.key) !== milestone.featureKey
    ) {
      invalid("A task or bug must belong to its milestone's Feature");
    }
    links.set(task.key, task.milestoneKey);
  }
  return { memberships, milestones: [...definitions.values()], links };
}
