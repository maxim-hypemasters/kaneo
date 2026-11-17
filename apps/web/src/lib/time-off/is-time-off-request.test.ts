import { expect, it } from "vite-plus/test";
import type { TimeOffEntry } from "@/fetchers/time-off/types";
import { isTimeOffRequest } from "./is-time-off-request";

const redacted: TimeOffEntry = {
  id: "t1",
  userId: "ana",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
};

it("tells a full request from a redacted entry", () => {
  expect(isTimeOffRequest(redacted)).toBe(false);
  expect(
    isTimeOffRequest({
      ...redacted,
      workspaceId: "w1",
      type: "vacation",
      status: "pending",
      days: 5,
      daysByYear: [{ year: 2026, days: 5 }],
      note: null,
      version: 0,
      createdBy: "ana",
      statusChangedBy: null,
      statusChangedAt: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      canEdit: true,
      canCancel: true,
      canDecide: false,
    }),
  ).toBe(true);
});
