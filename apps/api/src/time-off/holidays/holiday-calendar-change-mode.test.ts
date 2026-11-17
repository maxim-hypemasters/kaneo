import { describe, expect, it } from "vite-plus/test";
import { holidayCalendarChangeMode } from "./holiday-calendar-change-mode";

const member = {
  forSelf: true,
  canApprove: false,
  chosen: false,
  deadline: "2026-03-31",
  today: "2026-03-31",
};

describe("holidayCalendarChangeMode", () => {
  it("applies a member's first choice up to and on the deadline day", () => {
    expect(holidayCalendarChangeMode(member)).toBe("apply");
    expect(holidayCalendarChangeMode({ ...member, today: "2026-01-02" })).toBe(
      "apply",
    );
  });

  it("asks for approval of a first choice after the deadline", () => {
    expect(holidayCalendarChangeMode({ ...member, today: "2026-04-01" })).toBe(
      "request",
    );
  });

  it("always applies a first choice without a deadline", () => {
    expect(
      holidayCalendarChangeMode({
        ...member,
        deadline: null,
        today: "2099-12-31",
      }),
    ).toBe("apply");
  });

  it("asks for approval of every change after the free choice", () => {
    expect(holidayCalendarChangeMode({ ...member, chosen: true })).toBe(
      "request",
    );
    expect(
      holidayCalendarChangeMode({ ...member, chosen: true, deadline: null }),
    ).toBe("request");
  });

  it("applies an approver's own changes", () => {
    expect(
      holidayCalendarChangeMode({
        ...member,
        canApprove: true,
        chosen: true,
        today: "2026-04-01",
      }),
    ).toBe("apply");
  });

  it("applies changes made for another member", () => {
    expect(
      holidayCalendarChangeMode({
        ...member,
        forSelf: false,
        chosen: true,
        today: "2026-04-01",
      }),
    ).toBe("apply");
  });
});
