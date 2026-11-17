import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import {
  id,
  lang,
  memberId,
  timeOffToolRegistrar,
  withQuery,
  workspaceId,
  workspacePath,
  year,
} from "./time-off-tool.js";

const timeOffId = id.describe("Time off request ID.");
// Full calendar days with no time zone; the server's "today" is UTC.
const day = z.iso.date();
const type = z
  .enum(["vacation", "sick", "public_holiday"])
  .describe(
    "vacation, sick (a sick day) or public_holiday. Each type has its own yearly allowance.",
  );
const note = z
  .string()
  .trim()
  .max(500)
  .describe(
    "Up to 500 characters. Visible only to the person away and to approvers.",
  );
const version = z
  .number()
  .int()
  .min(0)
  .describe(
    "The request version you reviewed, from get_time_off_request or list_pending_time_off_requests.",
  );
const days = z
  .number()
  .int()
  .min(0)
  .max(366)
  .describe("Working days of the type allowed per Jan-Dec year.");

const PRIVACY =
  "Privacy: other members see only who is away and when; type, note, status and balance are visible only to the person away and to approvers.";
const COUNTING =
  "Days are working days: Monday to Friday, minus the member's calendar public holidays, counted per Jan-Dec year. Each type (vacation, sick, public_holiday) has its own allowance, with no carry-over; weekday holidays of the member's calendar also count as used public_holiday days.";
const OVER =
  "Going over the allowance is allowed: check overAllowanceDays or the balances (remainingDays below 0) and mention it.";
const VERSION =
  "Pass the current version: call get_time_off_request first. An edit since then returns 409 TIME_OFF_CHANGED, and a request no longer pending returns 409 TIME_OFF_STATUS.";
const APPROVER = "Needs time_off:approve and workspace membership.";

export function registerTimeOffTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const register = timeOffToolRegistrar(server);
  const requestPath = (requestId: string) =>
    `/api/time-off/${encodeURIComponent(requestId)}`;
  const decide = (
    requestId: string,
    action: "approve" | "decline",
    reviewed: number,
  ) =>
    client.json(`${requestPath(requestId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ version: reviewed }),
    });

  register(
    "list_time_off",
    `List who is away between from and to (inclusive YYYY-MM-DD, at most 366 days): entries holds approved time off of current members, plus pending requests that are yours or, for approvers, everyone's; holidays holds each current member's calendar public holidays in the window, which count as approved time off. ${PRIVACY} Other members' entries contain only id, userId, startDate and endDate, and their holidays only userId and date, unless you hold time_off:approve and are a member. Holiday names are in lang. Needs time_off:read.`,
    z
      .object({ workspaceId, from: day, to: day, lang })
      .refine((args) => args.from <= args.to, {
        message: "from must be on or before to",
        path: ["to"],
      }),
    ({ workspaceId, from, to, lang }) =>
      client.json(withQuery(workspacePath(workspaceId), { from, to, lang }), {
        method: "GET",
      }),
  );
  register(
    "list_time_off_requests",
    `List one member's time off requests of every status (pending, approved, declined, cancelled) that touch a Jan-Dec year, latest start first, with type, note, days, daysByYear, version and the canEdit, canCancel and canDecide flags. ${COUNTING} Your own need any time_off permission; another member's need time_off:approve and workspace membership.`,
    z.object({ workspaceId, userId: memberId, year }),
    ({ workspaceId, userId, year }) =>
      client.json(
        withQuery(`${workspacePath(workspaceId)}/requests`, { userId, year }),
        { method: "GET" },
      ),
  );
  register(
    "list_pending_time_off_requests",
    `List requests waiting for approval, oldest first, with type, note and version. Each carries the requester's balances for the years it touches and overAllowanceDays per year: how far approving it alone would go past the allowance. ${OVER} ${COUNTING} ${APPROVER}`,
    z.object({ workspaceId }),
    ({ workspaceId }) =>
      client.json(`${workspacePath(workspaceId)}/pending`, { method: "GET" }),
  );
  register(
    "get_time_off_request",
    `Read one time off request with its current version, days, daysByYear and the canEdit, canCancel and canDecide flags. Call it before approve_time_off_request or decline_time_off_request. Your own needs any time_off permission; another member's needs time_off:approve and membership, and otherwise reads as not found. ${PRIVACY}`,
    z.object({ timeOffId }),
    ({ timeOffId }) => client.json(requestPath(timeOffId), { method: "GET" }),
  );
  register(
    "request_time_off",
    `Request full days off, startDate to endDate inclusive (YYYY-MM-DD). Every request starts pending, an approver's own too; an approver then approves or declines it. Dates must fall between Jan 1 of last year and Dec 31 of next year, span at most 366 days and include a working day: a weekday that is not one of the member's calendar holidays (400 TIME_OFF_NO_WEEKDAYS). Use public_holiday for days off a calendar leaves out, or for members without a calendar. Overlapping the member's other pending or approved days returns 409 TIME_OFF_OVERLAP. ${COUNTING} ${OVER} For yourself it needs time_off:create; with userId it records time off for another current member and needs time_off:approve.`,
    z
      .strictObject({
        workspaceId,
        userId: id
          .optional()
          .describe(
            "Record time off for another current member (time_off:approve). Omit it to request for yourself.",
          ),
        type,
        startDate: day,
        endDate: day,
        note: note.optional(),
      })
      .refine((args) => args.startDate <= args.endDate, {
        message: "startDate must be on or before endDate",
        path: ["endDate"],
      }),
    ({ workspaceId, ...body }) =>
      client.json(workspacePath(workspaceId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
  );
  register(
    "update_time_off_request",
    `Change a request's type, dates or note; omitted fields stay unchanged and null clears the note. A change increments version. Requesters with time_off:create edit their pending requests; approvers with time_off:approve also edit approved ones, which stay approved. Editing approved time off as the requester, or a declined or cancelled request, returns 409 TIME_OFF_STATUS. New dates get the same checks as a new request, including 409 TIME_OFF_OVERLAP. ${OVER}`,
    z
      .strictObject({
        timeOffId,
        type: type.optional(),
        startDate: day.optional(),
        endDate: day.optional(),
        note: note.nullable().optional(),
      })
      .refine(
        (args) =>
          args.type !== undefined ||
          args.startDate !== undefined ||
          args.endDate !== undefined ||
          args.note !== undefined,
        "Provide a field to update",
      )
      .refine(
        (args) =>
          args.startDate === undefined ||
          args.endDate === undefined ||
          args.startDate <= args.endDate,
        {
          message: "startDate must be on or before endDate",
          path: ["endDate"],
        },
      ),
    ({ timeOffId, ...body }) =>
      client.json(requestPath(timeOffId), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  );
  register(
    "cancel_time_off_request",
    "Cancel a pending or approved request; it stays as history. Requesters with time_off:create cancel their pending requests, and approved ones until the end of their first day by the UTC date (409 TIME_OFF_STARTED after that); approvers with time_off:approve cancel any pending or approved request. Declined and cancelled requests return 409 TIME_OFF_STATUS.",
    z.object({ timeOffId }),
    ({ timeOffId }) =>
      client.json(`${requestPath(timeOffId)}/cancel`, { method: "POST" }),
  );
  register(
    "approve_time_off_request",
    `Approve a pending request, your own included. ${VERSION} ${OVER} ${APPROVER}`,
    z.strictObject({ timeOffId, version }),
    ({ timeOffId, version }) => decide(timeOffId, "approve", version),
  );
  register(
    "decline_time_off_request",
    `Decline a pending request, your own included. ${VERSION} ${APPROVER}`,
    z.strictObject({ timeOffId, version }),
    ({ timeOffId, version }) => decide(timeOffId, "decline", version),
  );
  register(
    "get_time_off_balance",
    `Read a member's balances for one year, one per type under types (vacation, sick, public_holiday): allowanceDays (their override of that type, else the workspace default; vacation 25, sick 10 and public_holiday 10 when unset), allowanceSource, usedDays (approved), pendingDays (not subtracted) and remainingDays = allowanceDays - usedDays, negative when over. ${COUNTING} Your own needs any time_off permission; another member's needs time_off:approve and workspace membership.`,
    z.object({ workspaceId, userId: memberId, year }),
    ({ workspaceId, userId, year }) =>
      client.json(
        withQuery(`${workspacePath(workspaceId)}/balance`, { userId, year }),
        { method: "GET" },
      ),
  );
  register(
    "list_time_off_balances",
    `List every current member's balances for one year, one per type, with the workspace default allowance of each type (defaultAllowances). ${COUNTING} ${APPROVER}`,
    z.object({ workspaceId, year }),
    ({ workspaceId, year }) =>
      client.json(
        withQuery(`${workspacePath(workspaceId)}/balances`, { year }),
        { method: "GET" },
      ),
  );
  register(
    "set_time_off_allowance",
    `Set how many working days of one type per Jan-Dec year members may take; each type has its own allowance. It applies to every year, past balances included. Without userId it sets the workspace default of the type (vacation 25, sick 10, public_holiday 10 when never set). With userId and a number it overrides that member's allowance of the type; with userId and days null it clears the override, so the member uses the default again. ${APPROVER}`,
    z
      .strictObject({
        workspaceId,
        type: type.describe("The type whose allowance to set."),
        userId: id
          .optional()
          .describe("Member whose override to set or clear, a current member."),
        days: days
          .nullable()
          .describe(
            "Working days of the type allowed per Jan-Dec year. Null clears a member's override and needs userId.",
          ),
      })
      .refine((args) => args.days !== null || args.userId !== undefined, {
        message: "days: null clears a member override, so it needs userId",
        path: ["days"],
      }),
    ({ workspaceId, type, userId, days }) => {
      const path = `${workspacePath(workspaceId)}/allowance/${type}`;
      if (userId === undefined)
        return client.json(path, {
          method: "PUT",
          body: JSON.stringify({ days }),
        });
      const memberPath = `${path}/${encodeURIComponent(userId)}`;
      return days === null
        ? client.json(memberPath, { method: "DELETE" })
        : client.json(memberPath, {
            method: "PUT",
            body: JSON.stringify({ days }),
          });
    },
  );
}
