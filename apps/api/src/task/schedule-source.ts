import { sql } from "drizzle-orm";
import { taskTable } from "../database/schema";

export type ScheduleSource = "legacy" | "applied" | "none";
export const taskScheduleSource = sql<ScheduleSource>`case
  when ${taskTable.startDate} is null and ${taskTable.dueDate} is null then 'none'
  when ${taskTable.scheduleSegments} is not null then 'applied'
  else 'legacy'
end`;
