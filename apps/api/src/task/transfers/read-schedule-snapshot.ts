import { scheduleSnapshotSchema } from "./schema";

function timestamp(value: unknown) {
  if (typeof value !== "string") return value;
  // PostgreSQL jsonb serializes timestamp-without-time-zone values without Z.
  // Database schedule timestamps are UTC, including the preservation migration.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    value,
  )
    ? `${value}Z`
    : value;
  const epoch = Date.parse(normalized);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : value;
}

export function readScheduleSnapshot(eventData: unknown, createdAt: Date) {
  const fields =
    typeof eventData === "object" && eventData !== null ? eventData : {};
  const source =
    "source" in fields && fields.source === "manual"
      ? "legacy"
      : "source" in fields
        ? fields.source
        : undefined;
  return scheduleSnapshotSchema.safeParse({
    ...fields,
    source,
    startDate: timestamp("startDate" in fields ? fields.startDate : undefined),
    dueDate: timestamp("dueDate" in fields ? fields.dueDate : undefined),
    createdAt: createdAt.toISOString(),
  });
}
