import type { milestoneTable } from "../database/schema";
import type { MilestoneExecution } from "./execution";

export function milestoneMetadata(
  row: typeof milestoneTable.$inferSelect,
  execution?: MilestoneExecution,
) {
  const {
    legacyStartDate: _start,
    legacyEndDate: _end,
    legacyStatus: _status,
    legacyColumnId: _column,
    ...metadata
  } = row;
  return {
    ...metadata,
    startDate: execution?.startDate ?? null,
    endDate: execution?.endDate ?? null,
    status: execution?.status ?? ("to-do" as const),
    columnId: null,
  };
}
