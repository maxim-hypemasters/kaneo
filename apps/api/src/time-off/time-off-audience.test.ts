import { describe, expect, it } from "vite-plus/test";
import {
  timeOffAudience,
  timeOffAudienceRecipients,
} from "./time-off-audience";
import type { TimeOffStatus } from "./time-off-kinds";

const request = (
  previousStatus: TimeOffStatus | null,
  status: TimeOffStatus,
) => ({
  kind: "request" as const,
  previousStatus,
  status,
});

describe("timeOffAudience", () => {
  it("tells the whole workspace when approved time off changes", () => {
    expect(timeOffAudience(request("pending", "approved"))).toBe("workspace");
    expect(timeOffAudience(request("approved", "approved"))).toBe("workspace");
    expect(timeOffAudience(request("approved", "cancelled"))).toBe("workspace");
  });

  it("tells the whole workspace when a setting changes", () => {
    expect(timeOffAudience({ kind: "settings" })).toBe("workspace");
  });

  it("tells the whole workspace when a holiday calendar changes", () => {
    expect(timeOffAudience({ kind: "holiday-calendar" })).toBe("workspace");
  });

  it("keeps holiday calendar requests with approvers", () => {
    expect(timeOffAudience({ kind: "holiday-calendar-request" })).toBe(
      "approvers",
    );
  });

  it("keeps changes that never involve approved time off with approvers", () => {
    expect(timeOffAudience(request(null, "pending"))).toBe("approvers");
    expect(timeOffAudience(request("pending", "pending"))).toBe("approvers");
    expect(timeOffAudience(request("pending", "declined"))).toBe("approvers");
    expect(timeOffAudience(request("pending", "cancelled"))).toBe("approvers");
  });
});

describe("timeOffAudienceRecipients", () => {
  const memberIds = ["owner", "admin", "member", "colleague", "member"];

  it("lists every member once for the workspace audience", () => {
    expect(
      timeOffAudienceRecipients({
        audience: "workspace",
        memberIds,
        approverIds: ["owner"],
        requesterId: "member",
      }),
    ).toEqual(["owner", "admin", "member", "colleague"]);
  });

  it("lists approvers and the requester once for the approver audience", () => {
    expect(
      timeOffAudienceRecipients({
        audience: "approvers",
        memberIds,
        approverIds: ["owner", "admin"],
        requesterId: "member",
      }),
    ).toEqual(["owner", "admin", "member"]);
    expect(
      timeOffAudienceRecipients({
        audience: "approvers",
        memberIds,
        approverIds: ["owner", "admin"],
        requesterId: "admin",
      }),
    ).toEqual(["owner", "admin"]);
  });

  it("leaves out a requester who is no longer a member", () => {
    expect(
      timeOffAudienceRecipients({
        audience: "approvers",
        memberIds: ["owner"],
        approverIds: ["owner"],
        requesterId: "removed",
      }),
    ).toEqual(["owner"]);
  });
});
