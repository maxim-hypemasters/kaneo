import { describe, expect, it } from "vite-plus/test";
import { planHolidayCalendarChoice } from "./plan-holiday-calendar-choice";

const DE = { country: "DE", region: null };
const BY = { country: "DE", region: "BY" };
const FR = { country: "FR", region: null };

const member = {
  mode: "request" as const,
  forSelf: true,
  canApprove: false,
  chosen: true,
  current: DE,
  pending: undefined,
  target: FR,
};

describe("planHolidayCalendarChoice", () => {
  describe("applying", () => {
    const apply = { ...member, mode: "apply" as const, chosen: false };

    it("writes a member's free first choice", () => {
      expect(planHolidayCalendarChoice({ ...apply, current: null })).toEqual({
        write: true,
        status: "applied",
        request: "none",
      });
    });

    it("records an explicit No calendar for a member without a row", () => {
      expect(
        planHolidayCalendarChoice({ ...apply, current: null, target: null }),
      ).toEqual({ write: true, status: "applied", request: "none" });
    });

    it("withdraws your own request when your calendar stays the same", () => {
      expect(
        planHolidayCalendarChoice({
          ...apply,
          canApprove: true,
          chosen: true,
          pending: FR,
          target: DE,
        }),
      ).toEqual({ write: false, status: "applied", request: "cancel" });
    });

    it("leaves a member's request alone when an approver re-saves their calendar", () => {
      expect(
        planHolidayCalendarChoice({
          ...apply,
          forSelf: false,
          canApprove: true,
          chosen: true,
          pending: FR,
          target: DE,
        }),
      ).toEqual({ write: false, status: "applied", request: "keep" });
    });

    it("approves a request when an approver sets its target", () => {
      expect(
        planHolidayCalendarChoice({
          ...apply,
          forSelf: false,
          canApprove: true,
          chosen: true,
          pending: FR,
          target: FR,
        }),
      ).toEqual({ write: true, status: "applied", request: "approve" });
      expect(
        planHolidayCalendarChoice({
          ...apply,
          forSelf: false,
          canApprove: true,
          chosen: true,
          pending: null,
          target: null,
        }),
      ).toEqual({ write: true, status: "applied", request: "approve" });
    });

    it("cancels a request when an approver sets another calendar", () => {
      expect(
        planHolidayCalendarChoice({
          ...apply,
          forSelf: false,
          canApprove: true,
          chosen: true,
          pending: FR,
          target: BY,
        }),
      ).toEqual({ write: true, status: "applied", request: "cancel" });
    });

    it("cancels a member's own request when their free choice applies", () => {
      expect(
        planHolidayCalendarChoice({
          ...apply,
          current: null,
          pending: FR,
          target: FR,
        }),
      ).toEqual({ write: true, status: "applied", request: "cancel" });
    });
  });

  describe("requesting", () => {
    it("creates a request for a new calendar", () => {
      expect(planHolidayCalendarChoice(member)).toEqual({
        write: false,
        status: "pending",
        request: "create",
      });
    });

    it("asks for No calendar after the free choice", () => {
      expect(planHolidayCalendarChoice({ ...member, target: null })).toEqual({
        write: false,
        status: "pending",
        request: "create",
      });
    });

    it("asks for approval of a first No calendar after the deadline", () => {
      expect(
        planHolidayCalendarChoice({
          ...member,
          chosen: false,
          current: null,
          target: null,
        }),
      ).toEqual({ write: false, status: "pending", request: "create" });
    });

    it("updates a pending request with a new target", () => {
      expect(planHolidayCalendarChoice({ ...member, pending: BY })).toEqual({
        write: false,
        status: "pending",
        request: "update",
      });
    });

    it("keeps a pending request asked for again", () => {
      expect(planHolidayCalendarChoice({ ...member, pending: FR })).toEqual({
        write: false,
        status: "pending",
        request: "keep",
      });
    });

    it("withdraws the request when the member re-sends their calendar", () => {
      expect(
        planHolidayCalendarChoice({ ...member, pending: FR, target: DE }),
      ).toEqual({ write: false, status: "applied", request: "cancel" });
      expect(planHolidayCalendarChoice({ ...member, target: DE })).toEqual({
        write: false,
        status: "applied",
        request: "none",
      });
    });
  });
});
