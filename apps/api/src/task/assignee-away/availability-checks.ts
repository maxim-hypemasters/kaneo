// The fields of a Task or Bug that decide which of its dates are checked
// against its assignee's days away.
export type DatedWork = {
  userId: string | null;
  scheduledAssigneeId: string | null;
  scheduleSegments: readonly unknown[] | null;
  startDate: Date | null;
  dueDate: Date | null;
};

export type DateField = "startDate" | "dueDate";
export type DateEndpoint = { field: DateField; at: Date };
export type AvailabilityCheck = {
  assigneeId: string;
  endpoints: DateEndpoint[];
};

const FIELDS: readonly DateField[] = ["startDate", "dueDate"];

// Planned work (it has segments) belongs to its planned assignee until the
// next Apply; anything else, segments [] included, to its assignee.
export function effectiveAssigneeId(
  work: Pick<DatedWork, "userId" | "scheduledAssigneeId" | "scheduleSegments">,
) {
  return work.scheduleSegments?.length ? work.scheduledAssigneeId : work.userId;
}

// The dates a write must check against the assignee's days away: the ones it
// changes, or both when the work goes to someone else. Unchanged dates are
// never checked again, so time off approved over existing work never blocks
// an unrelated edit. Null for unassigned work, for planned work (its dates
// are laid out around those days) and when there is nothing to check.
export function availabilityChecks(
  before: DatedWork,
  after: DatedWork,
): AvailabilityCheck | null {
  if (after.scheduleSegments?.length) return null;
  const assigneeId = effectiveAssigneeId(after);
  if (!assigneeId) return null;
  const handedOver = assigneeId !== effectiveAssigneeId(before);
  const endpoints = FIELDS.flatMap((field) => {
    const at = after[field];
    return at && (handedOver || at.getTime() !== before[field]?.getTime())
      ? [{ field, at }]
      : [];
  });
  return endpoints.length ? { assigneeId, endpoints } : null;
}
