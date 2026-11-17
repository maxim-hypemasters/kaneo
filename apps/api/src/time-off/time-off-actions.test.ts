import { describe, expect, it } from "vite-plus/test";
import type { TimeOffStatus } from "./time-off-kinds";
import { type TimeOffActionViewer, timeOffActions } from "./time-off-actions";

const today = "2026-11-14";
const requester: TimeOffActionViewer = {
  userId: "ana",
  canApprove: false,
  canCreate: true,
  today,
};
const approver: TimeOffActionViewer = {
  userId: "olga",
  canApprove: true,
  canCreate: true,
  today,
};
const selfApprover: TimeOffActionViewer = { ...approver, userId: "ana" };
const otherMember: TimeOffActionViewer = { ...requester, userId: "ben" };
const viewerOnly: TimeOffActionViewer = { ...requester, canCreate: false };

function row(status: TimeOffStatus, startDate = "2026-11-16") {
  return { userId: "ana", status, startDate };
}

const none = { canEdit: false, canCancel: false, canDecide: false };

describe("timeOffActions", () => {
  describe("pending", () => {
    it("lets the requester edit and cancel, but not decide", () => {
      expect(timeOffActions(row("pending"), requester)).toEqual({
        canEdit: true,
        canCancel: true,
        canDecide: false,
      });
    });

    it("lets an approver edit, cancel and decide", () => {
      expect(timeOffActions(row("pending"), approver)).toEqual({
        canEdit: true,
        canCancel: true,
        canDecide: true,
      });
    });

    it("lets an approver decide their own request", () => {
      expect(timeOffActions(row("pending"), selfApprover)).toEqual({
        canEdit: true,
        canCancel: true,
        canDecide: true,
      });
    });

    it("gives other members nothing", () => {
      expect(timeOffActions(row("pending"), otherMember)).toEqual(none);
    });

    it("gives a requester without time_off:create nothing", () => {
      expect(timeOffActions(row("pending"), viewerOnly)).toEqual(none);
    });
  });

  describe("approved", () => {
    it("lets an approver edit and cancel at any time, but not decide again", () => {
      for (const startDate of ["2026-11-16", today, "2026-11-01"]) {
        expect(timeOffActions(row("approved", startDate), approver)).toEqual({
          canEdit: true,
          canCancel: true,
          canDecide: false,
        });
      }
    });

    it("lets the requester cancel until the start day, but never edit", () => {
      expect(timeOffActions(row("approved", "2026-11-16"), requester)).toEqual({
        canEdit: false,
        canCancel: true,
        canDecide: false,
      });
      expect(timeOffActions(row("approved", today), requester)).toEqual({
        canEdit: false,
        canCancel: true,
        canDecide: false,
      });
      expect(timeOffActions(row("approved", "2026-11-13"), requester)).toEqual(
        none,
      );
    });

    it("gives other members and requesters without create nothing", () => {
      expect(timeOffActions(row("approved"), otherMember)).toEqual(none);
      expect(timeOffActions(row("approved"), viewerOnly)).toEqual(none);
    });
  });

  describe.each(["declined", "cancelled"] as const)("%s", (status) => {
    it("is final for everyone", () => {
      for (const viewer of [requester, approver, selfApprover, otherMember]) {
        expect(timeOffActions(row(status), viewer)).toEqual(none);
      }
    });
  });
});
