import { and, eq } from "drizzle-orm";
import db, { schema } from "../../../apps/api/src/database";
import type { createApp } from "../../../apps/api/src/index";
import { jsonRequest } from "./release/json-request";

type App = ReturnType<typeof createApp>["app"];
type TimeOffInsert = typeof schema.timeOffTable.$inferInsert;

const DAY_MS = 86_400_000;

// YYYY-MM-DD `days` after `day` (UTC; negative goes back).
export function addDays(day: string, days: number) {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

// The Monday `weeks` weeks after this week's, as YYYY-MM-DD (UTC), so dates
// stay inside the API's last-year-to-next-year window whenever tests run.
export function mondayInWeeks(weeks: number) {
  const today = new Date().toISOString().slice(0, 10);
  const sinceMonday = (new Date(Date.parse(today)).getUTCDay() + 6) % 7;
  return addDays(today, weeks * 7 - sinceMonday);
}

// A time_off row written directly, for states (approved, past, cancelled)
// that would take several API calls to reach.
export async function insertTimeOff(
  values: Pick<
    TimeOffInsert,
    "workspaceId" | "userId" | "startDate" | "endDate"
  > &
    Partial<TimeOffInsert>,
) {
  const [row] = await db
    .insert(schema.timeOffTable)
    .values({
      type: "vacation",
      status: "pending",
      createdBy: values.userId,
      ...values,
    })
    .returning();
  if (!row) throw new Error("Failed to insert time off");
  return row;
}

// Defines a custom role, or replaces a built-in role's stored permissions,
// in one workspace.
export async function setWorkspaceRolePermissions(
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) {
  await db
    .delete(schema.workspaceRoleTable)
    .where(
      and(
        eq(schema.workspaceRoleTable.workspaceId, workspaceId),
        eq(schema.workspaceRoleTable.role, role),
      ),
    );
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId,
    role,
    permission: JSON.stringify(permission),
  });
}

export async function setMemberRole(
  workspaceId: string,
  userId: string,
  role: string,
) {
  await db
    .update(schema.workspaceUserTable)
    .set({ role })
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    );
}

// Calls /api/time-off as whoever the session mock currently returns.
export function timeOffClient(app: App) {
  return (path: string, method = "GET", body?: unknown) =>
    app.request(
      `/api/time-off${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
}
