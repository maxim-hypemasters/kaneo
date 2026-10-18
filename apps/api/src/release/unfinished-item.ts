import { sql } from "drizzle-orm";
import { taskTable } from "../database/schema";
import { taskIsCompleted } from "../task/task-is-completed";

// An item Move unfinished moves, and progress counts as unfinished: neither
// archived nor in a final column. Planned items count.
export const isUnfinishedItem = sql<boolean>`(${taskTable.status} <> 'archived' and not ${taskIsCompleted})`;
