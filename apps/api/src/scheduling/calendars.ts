import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  projectTable,
  workCalendarTable,
  workspaceUserTable,
} from "../database/schema";
import { publishEvent } from "../events";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { calendarParam, workCalendarBody, workCalendarSchema } from "./schema";

const errors = {
  400: errorResponse("Invalid calendar"),
  403: errorResponse("Cannot manage this calendar"),
  404: errorResponse("Workspace member not found"),
};
const list = createRoute({
  method: "get",
  path: "/{workspaceId}",
  operationId: "listWorkCalendars",
  tags: ["Planning"],
  summary: "Read workspace member availability calendars",
  middleware: [
    workspaceAccess.fromParam(),
    requireWorkspacePermission({ task: ["read"] }),
  ] as const,
  request: { params: z.object({ workspaceId: z.string().min(1) }) },
  responses: {
    200: jsonResponse(
      "Configured availability calendars",
      z.array(workCalendarSchema),
    ),
    ...errors,
  },
});
const save = createRoute({
  method: "put",
  path: "/{workspaceId}/{userId}",
  operationId: "saveWorkCalendar",
  tags: ["Planning"],
  summary:
    "Configure your working hours and time off; member managers may configure others",
  middleware: [
    workspaceAccess.fromParam(),
    requireWorkspacePermission({ task: ["read"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: calendarParam,
    body: {
      required: true,
      content: { "application/json": { schema: workCalendarBody } },
    },
  },
  responses: {
    200: jsonResponse("Saved availability", workCalendarSchema),
    ...errors,
  },
});
const calendars = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(list, async (c) => {
    const workspaceId = c.req.valid("param").workspaceId;
    const rows = await db
      .select({
        userId: workCalendarTable.userId,
        timeZone: workCalendarTable.timeZone,
        weeklyIntervals: workCalendarTable.weeklyIntervals,
        timeOff: workCalendarTable.timeOff,
      })
      .from(workCalendarTable)
      .innerJoin(
        workspaceUserTable,
        and(
          eq(workspaceUserTable.workspaceId, workCalendarTable.workspaceId),
          eq(workspaceUserTable.userId, workCalendarTable.userId),
        ),
      )
      .where(eq(workCalendarTable.workspaceId, workspaceId));
    return c.json(rows, 200);
  })
  .openapi(save, async (c) => {
    const { workspaceId, userId } = c.req.valid("param");
    if (
      userId !== c.get("userId") &&
      !(await hasWorkspacePermission(c, { member: ["update"] }))
    )
      throw new HTTPException(403, {
        message: "You can only edit your own calendar",
      });
    // API keys must carry the explicit write scope even for their own calendar.
    if (
      c.get("apiKey") &&
      !(await hasWorkspacePermission(c, { task: ["update"] }))
    )
      throw new HTTPException(403, {
        message: "Calendar writes require task:update scope",
      });
    const body = c.req.valid("json");
    const result = await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(workspaceUserTable)
        .where(
          and(
            eq(workspaceUserTable.workspaceId, workspaceId),
            eq(workspaceUserTable.userId, userId),
          ),
        )
        .for("share");
      if (!member)
        throw new HTTPException(404, { message: "Workspace member not found" });
      const [saved] = await tx
        .insert(workCalendarTable)
        .values({ workspaceId, userId, ...body })
        .onConflictDoUpdate({
          target: [workCalendarTable.workspaceId, workCalendarTable.userId],
          set: { ...body, updatedAt: new Date() },
        })
        .returning();
      if (!saved)
        throw new HTTPException(500, { message: "Calendar was not saved" });
      return saved;
    });
    const projects = await db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(eq(projectTable.workspaceId, workspaceId));
    for (const project of projects)
      await publishEvent("project-schedule.changed", { projectId: project.id });
    return c.json(
      {
        userId,
        timeZone: result.timeZone,
        weeklyIntervals: result.weeklyIntervals,
        timeOff: result.timeOff,
      },
      200,
    );
  });
export default calendars;
