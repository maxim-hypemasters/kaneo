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

// Codes as list_holiday_countries returns them; the API ignores case.
const code = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,10}$/);

const EFFECT =
  "An applied calendar's public holidays count as approved time off without time off requests, never count as days of the member's requests, and count as used public_holiday days on weekdays. Planned work skips them and plans that include the member become outdated. Only public holidays are used, not bank, school or optional days; members can still request public_holiday time off for those.";
const RULES =
  'A member\'s first choice, country null ("No calendar") included, applies at once on or before the workspace\'s holiday calendar deadline (a UTC day that counts), or at any time without a deadline. Every later change by the member, and any choice after the deadline, returns status "pending" with pendingRequest, and nothing changes until an approver approves it with approve_holiday_calendar_request. A new request notifies approvers; sending another change while one waits updates that request (its version goes up) without notifying anyone. cancel_holiday_calendar_request, or sending the current calendar again, withdraws it. Changes by approvers, for themselves or for another member, apply at once (status "applied"); applying exactly the calendar a member asked for approves their request.';
const PRIVACY =
  "Other members see only which days a member is away for a holiday, never the holiday names, country or region.";

export function registerTimeOffHolidayTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  const register = timeOffToolRegistrar(server);

  register(
    "list_holiday_countries",
    "List the countries a member can pick as their public holiday calendar, with code and name. With country, list that country's regions (states or provinces with their own holidays) instead; an unknown country is not found. Holiday data ships with Kaneo. Needs any time_off permission (time_off:read, time_off:create or time_off:approve).",
    z.object({
      workspaceId,
      country: code
        .optional()
        .describe("Country code, such as DE, to list its regions."),
      lang,
    }),
    ({ workspaceId, country, lang }) =>
      client.json(
        withQuery(
          `${workspacePath(workspaceId)}/holiday-countries${
            country === undefined
              ? ""
              : `/${encodeURIComponent(country)}/regions`
          }`,
          { lang },
        ),
        { method: "GET" },
      ),
  );
  register(
    "get_holiday_calendar",
    `Read a member's public holiday calendar (country and region, or null) and its holidays in one Jan-Dec year with names, weekends included. It also returns calendarChosen (whether the free first choice is used), pendingRequest (a change waiting for approval, with id and version, or null), holidayCalendarDeadline (the workspace's last UTC day for a free first choice, or null) and nextChangeNeedsApproval. ${PRIVACY} Your own needs any time_off permission; another member's needs time_off:approve and workspace membership.`,
    z.object({ workspaceId, userId: memberId, year, lang }),
    ({ workspaceId, userId, year, lang }) =>
      client.json(
        withQuery(`${workspacePath(workspaceId)}/holidays`, {
          userId,
          year,
          lang,
        }),
        { method: "GET" },
      ),
  );
  register(
    "set_holiday_calendar",
    `Set a member's public holiday calendar to a country and optional region from list_holiday_countries, or clear it with country null so they enter public holidays as public_holiday requests. Returns status ("applied" or "pending"), calendar (the one in effect) and pendingRequest. ${RULES} ${EFFECT} An unknown country or region returns 400 TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN. Your own needs time_off:create; another current member's needs time_off:approve and workspace membership.`,
    z
      .strictObject({
        workspaceId,
        userId: id
          .optional()
          .describe(
            "Member whose calendar to set, a current member (time_off:approve). Omit it for yourself.",
          ),
        country: code
          .nullable()
          .describe("Country code, such as DE, or null to clear the calendar."),
        region: code
          .nullable()
          .optional()
          .describe(
            "Region code, such as BY. Omit it or pass null for the whole country.",
          ),
      })
      .refine((args) => args.country !== null || args.region == null, {
        message: "region needs a country",
        path: ["region"],
      }),
    ({ workspaceId, userId, country, region }) => {
      const path = `${workspacePath(workspaceId)}/holiday-calendar`;
      return country === null
        ? client.json(withQuery(path, { userId }), { method: "DELETE" })
        : client.json(path, {
            method: "PUT",
            body: JSON.stringify({ userId, country, region }),
          });
    },
  );
}
