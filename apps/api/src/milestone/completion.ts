import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { columnTable, milestoneTable, taskTable } from "../database/schema";

type WorkStatus = { projectId: AnyPgColumn; status: AnyPgColumn };

export function milestoneWorkIsCompleted(task: WorkStatus) {
  return sql<boolean>`exists (
    select 1 from ${columnTable}
    where ${columnTable.projectId} = ${task.projectId}
      and ${columnTable.slug} = ${task.status}
      and ${columnTable.isFinal} = true
  )`;
}

export function milestoneWorkIsActive(task: WorkStatus) {
  const first = alias(columnTable, "milestone_first_nonfinal");
  return sql<boolean>`${task.status} not in ('planned', 'backlog', 'archived') and exists (
    select 1 from ${columnTable}
    where ${columnTable.projectId} = ${task.projectId}
      and ${columnTable.slug} = ${task.status}
      and ${columnTable.isFinal} = false
      and ${columnTable.id} <> (
        select ${first.id} from ${columnTable} as ${first}
        where ${first.projectId} = ${task.projectId} and ${first.isFinal} = false
        order by ${first.position}, ${first.id} limit 1
      )
  )`;
}

const work = alias(taskTable, "milestone_completion_work");
const owner = alias(taskTable, "milestone_completion_owner");
const eligible = and(
  eq(work.milestoneId, milestoneTable.id),
  eq(work.featureId, milestoneTable.featureId),
  inArray(work.type, ["task", "bug"]),
  ne(work.status, "archived"),
  sql`exists (select 1 from ${taskTable} as ${owner} where ${owner.id} = ${milestoneTable.featureId} and ${owner.type} = 'feature' and ${owner.projectId} = ${work.projectId})`,
);

// Shared by release totals and Move unfinished. Completion uses the whole
// milestone, including work with a different release, and requires a member.
export const milestoneIsCompleted = sql<boolean>`(
  exists (select 1 from ${taskTable} as ${work} where ${eligible})
  and not exists (select 1 from ${taskTable} as ${work} where ${eligible} and not ${milestoneWorkIsCompleted(work)})
)`;

export function milestoneStatus(
  total: number,
  completed: number,
  active: number,
) {
  if (total > 0 && completed === total) return "done" as const;
  if (active > 0 || completed > 0) return "in-progress" as const;
  return "to-do" as const;
}
