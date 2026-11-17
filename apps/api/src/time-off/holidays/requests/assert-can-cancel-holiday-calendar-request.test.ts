import { describe, expect, it } from "vite-plus/test";
import { assertCanCancelHolidayCalendarRequest } from "./assert-can-cancel-holiday-calendar-request";

const viewer = {
  userId: "member",
  canApprove: false,
  canCreate: true,
  today: "2026-03-01",
};

describe("assertCanCancelHolidayCalendarRequest", () => {
  it("lets the member withdraw their own request", () => {
    expect(() =>
      assertCanCancelHolidayCalendarRequest({ userId: "member" }, viewer),
    ).not.toThrow();
  });

  it("lets approvers cancel anyone's request", () => {
    expect(() =>
      assertCanCancelHolidayCalendarRequest(
        { userId: "colleague" },
        { ...viewer, canApprove: true, canCreate: false },
      ),
    ).not.toThrow();
  });

  it("refuses someone else's request without approve", () => {
    expect(() =>
      assertCanCancelHolidayCalendarRequest({ userId: "colleague" }, viewer),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("refuses your own request without create", () => {
    expect(() =>
      assertCanCancelHolidayCalendarRequest(
        { userId: "member" },
        { ...viewer, canCreate: false },
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
