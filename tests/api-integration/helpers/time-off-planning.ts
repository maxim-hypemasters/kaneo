import { expect } from "vite-plus/test";
import type { TimeOffType } from "../../../apps/api/src/time-off/time-off-kinds";

type Call = (
  method: string,
  path: string,
  body?: unknown,
) => Response | Promise<Response>;
type PendingRequest = { id: string; version: number };

// Requests time off through the API as the session user, for `userId` when
// given (needs time_off:approve), and returns the pending request.
export async function requestTimeOff(
  call: Call,
  workspaceId: string,
  range: {
    startDate: string;
    endDate?: string;
    type?: TimeOffType;
    userId?: string;
  },
): Promise<PendingRequest> {
  const response = await call("POST", `/time-off/workspace/${workspaceId}`, {
    type: range.type ?? "vacation",
    startDate: range.startDate,
    endDate: range.endDate ?? range.startDate,
    ...(range.userId ? { userId: range.userId } : {}),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { request: PendingRequest }).request;
}

// Approves or declines a pending request at the version it was read.
export async function decideTimeOff(
  call: Call,
  request: PendingRequest,
  decision: "approve" | "decline",
) {
  const response = await call("POST", `/time-off/${request.id}/${decision}`, {
    version: request.version,
  });
  expect(response.status).toBe(200);
}

// Sets the session user's public holiday calendar, or clears it with null.
export async function setHolidayCalendar(
  call: Call,
  workspaceId: string,
  calendar: { country: string; region?: string } | null,
) {
  const path = `/time-off/workspace/${workspaceId}/holiday-calendar`;
  const response = calendar
    ? await call("PUT", path, calendar)
    : await call("DELETE", path);
  expect(response.status).toBe(200);
}
