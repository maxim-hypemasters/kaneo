import type { GanttMilestoneRecord, ScheduledMilestone } from "./gantt-types";
import { parseTaskDate } from "./timeline";

type Member = { id: string; name?: string | null; image?: string | null };

export function scheduledMilestones(
  milestones: readonly GanttMilestoneRecord[],
  members: readonly Member[] = [],
): ScheduledMilestone[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  return milestones.flatMap((milestone) => {
    const start = parseTaskDate(
      milestone.startDate ?? milestone.endDate ?? null,
    );
    const end = parseTaskDate(milestone.endDate ?? milestone.startDate ?? null);
    if (!start || !end) return [];
    const lead = milestone.leadId ? membersById.get(milestone.leadId) : null;
    return [
      {
        // Task IDs cannot contain a colon. A milestone can share a raw ID
        // with a task without sharing its React, DOM, or optimistic-edit key.
        id: `milestone:${milestone.id}`,
        entityKind: "milestone" as const,
        type: "milestone" as const,
        milestone,
        title: `${milestone.featureTitle} · ${milestone.title}`,
        featureId: milestone.featureId,
        milestoneId: milestone.id,
        projectId: milestone.projectId,
        number: null,
        description: null,
        status: milestone.status,
        columnId: milestone.columnId,
        priority: milestone.priority,
        releaseId: milestone.releaseId,
        startDate: milestone.startDate ?? null,
        dueDate: milestone.endDate ?? null,
        scheduleStart: start < end ? start : end,
        scheduleEnd: end > start ? end : start,
        position: milestone.position,
        createdAt: "",
        userId: milestone.leadId,
        assigneeId: milestone.leadId,
        assigneeName: lead?.name ?? null,
        assigneeImage: lead?.image ?? null,
        subtaskCounts: milestone.progress,
      },
    ];
  });
}
