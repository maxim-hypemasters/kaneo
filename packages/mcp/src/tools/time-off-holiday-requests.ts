import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import {
  id,
  lang,
  timeOffToolRegistrar,
  withQuery,
  workspaceId,
  workspacePath,
} from "./time-off-tool.js";

const requestId = id.describe(
  "Holiday calendar request ID, from list_holiday_calendar_requests or get_holiday_calendar's pendingRequest.",
);
const version = z
  .number()
  .int()
  .min(0)
  .describe(
    "The request version you reviewed, from list_holiday_calendar_requests.",
  );

const PRIVACY =
  "Requests show the country and region asked for only to the member and to approvers; notifications and live updates never carry them.";
const VERSION =
  "Pass the version you reviewed: a change by the member since then returns 409 TIME_OFF_CHANGED, and a request no longer pending returns 409 TIME_OFF_STATUS.";
const APPROVER = "Needs time_off:approve and workspace membership.";

export function registerTimeOffHolidayRequestTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const register = timeOffToolRegistrar(server);
  const requestsPath = (workspace: string) =>
    `${workspacePath(workspace)}/holiday-calendar-requests`;
  const requestPath = (workspace: string, request: string, action: string) =>
    `${requestsPath(workspace)}/${encodeURIComponent(request)}/${action}`;
  const decide = (
    args: {
      workspaceId: string;
      requestId: string;
      version: number;
      lang?: string;
    },
    action: "approve" | "decline",
  ) =>
    client.json(
      withQuery(requestPath(args.workspaceId, args.requestId, action), {
        lang: args.lang,
      }),
      { method: "POST", body: JSON.stringify({ version: args.version }) },
    );

  register(
    "list_holiday_calendar_requests",
    `List current members' public holiday calendar changes waiting for approval, oldest first: each has id, userId, version, the calendar asked for (null means No calendar) and currentCalendar, the one it would replace. Names are in lang. ${PRIVACY} ${APPROVER}`,
    z.object({ workspaceId, lang }),
    ({ workspaceId, lang }) =>
      client.json(withQuery(requestsPath(workspaceId), { lang }), {
        method: "GET",
      }),
  );
  register(
    "approve_holiday_calendar_request",
    `Approve a pending holiday calendar change, your own included: the member's calendar becomes the one asked for, plans that include them become outdated, and the member is notified unless they decided it themselves. A calendar the holiday data no longer knows returns 400 TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN; decline it instead. ${VERSION} ${APPROVER}`,
    z.strictObject({ workspaceId, requestId, version, lang }),
    (args) => decide(args, "approve"),
  );
  register(
    "decline_holiday_calendar_request",
    `Decline a pending holiday calendar change, your own included: the member's calendar stays as it is, and the member is notified unless they decided it themselves. ${VERSION} ${APPROVER}`,
    z.strictObject({ workspaceId, requestId, version, lang }),
    (args) => decide(args, "decline"),
  );
  register(
    "cancel_holiday_calendar_request",
    "Withdraw a pending holiday calendar change; the calendar stays as it is and nobody is notified. Your own needs time_off:create; another member's needs time_off:approve and workspace membership. A request no longer pending returns 409 TIME_OFF_STATUS.",
    z.object({ workspaceId, requestId }),
    ({ workspaceId, requestId }) =>
      client.json(requestPath(workspaceId, requestId, "cancel"), {
        method: "POST",
      }),
  );
  register(
    "set_holiday_calendar_deadline",
    `Set the workspace's deadline for members' free first public holiday calendar choice: the last UTC day (YYYY-MM-DD), inclusive, on which a member's first choice applies without approval. Null removes the deadline, so a first choice is always free. After the deadline, every calendar choice by a member needs approval; pending requests stay as they are. Members see the deadline in get_holiday_calendar. ${APPROVER}`,
    z.strictObject({
      workspaceId,
      deadline: z.iso
        .date()
        .nullable()
        .describe("The last free day, YYYY-MM-DD, or null for no deadline."),
    }),
    ({ workspaceId, deadline }) =>
      client.json(`${workspacePath(workspaceId)}/settings`, {
        method: "PUT",
        body: JSON.stringify({ holidayCalendarDeadline: deadline }),
      }),
  );
}
