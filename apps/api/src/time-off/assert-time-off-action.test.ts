import { describe, expect, it } from "vite-plus/test";
import {
  assertCanCancel,
  assertCanDecide,
  assertCanEdit,
  assertTimeOffVisible,
} from "./assert-time-off-action";
import type { TimeOffActionViewer } from "./time-off-actions";
import type { TimeOffStatus } from "./time-off-kinds";

const today = "2026-11-14";
const requester: TimeOffActionViewer = {
  userId: "ana",
  canApprove: false,
  canCreate: true,
  today,
};
const approver: TimeOffActionViewer = {
  userId: "boss",
  canApprove: true,
  canCreate: true,
  today,
};
const reader: TimeOffActionViewer = {
  userId: "ana",
  canApprove: false,
  canCreate: false,
  today,
};
const row = (status: TimeOffStatus, startDate = "2026-11-16") => ({
  userId: "ana",
  status,
  startDate,
  version: 2,
});

function failure(run: () => void) {
  try {
    run();
  } catch (error) {
    const { status, code } = error as { status: number; code?: string };
    return { status, code };
  }
  return null;
}

describe("assertTimeOffVisible", () => {
  it("hides other members' requests from non-approvers as not found", () => {
    expect(failure(() => assertTimeOffVisible(row("pending"), requester))).toBe(
      null,
    );
    expect(failure(() => assertTimeOffVisible(row("pending"), approver))).toBe(
      null,
    );
    expect(
      failure(() =>
        assertTimeOffVisible(row("pending"), { ...requester, userId: "cy" }),
      ),
    ).toEqual({ status: 404, code: undefined });
  });
});

describe("assertCanEdit", () => {
  it("lets requesters edit pending requests and approvers edit approved ones", () => {
    expect(failure(() => assertCanEdit(row("pending"), requester))).toBe(null);
    expect(failure(() => assertCanEdit(row("approved"), approver))).toBe(null);
  });

  it("tells a requester their request was already approved", () => {
    expect(failure(() => assertCanEdit(row("approved"), requester))).toEqual({
      status: 409,
      code: "TIME_OFF_STATUS",
    });
  });

  it("rejects decided requests for everyone", () => {
    for (const status of ["declined", "cancelled"] as const) {
      expect(failure(() => assertCanEdit(row(status), approver))).toEqual({
        status: 409,
        code: "TIME_OFF_STATUS",
      });
    }
  });

  it("refuses requesters without time_off:create", () => {
    expect(failure(() => assertCanEdit(row("pending"), reader))).toEqual({
      status: 403,
      code: "MISSING_PERMISSION",
    });
  });
});

describe("assertCanCancel", () => {
  it("lets a requester cancel approved time off only before it starts", () => {
    expect(failure(() => assertCanCancel(row("approved"), requester))).toBe(
      null,
    );
    expect(
      failure(() => assertCanCancel(row("approved", "2026-11-13"), requester)),
    ).toEqual({ status: 409, code: "TIME_OFF_STARTED" });
    expect(
      failure(() => assertCanCancel(row("approved", "2026-11-13"), approver)),
    ).toBe(null);
  });

  it("rejects decided requests and missing permissions", () => {
    expect(failure(() => assertCanCancel(row("declined"), approver))).toEqual({
      status: 409,
      code: "TIME_OFF_STATUS",
    });
    expect(failure(() => assertCanCancel(row("pending"), reader))).toEqual({
      status: 403,
      code: "MISSING_PERMISSION",
    });
  });
});

describe("assertCanDecide", () => {
  it("accepts a pending request at the reviewed version", () => {
    expect(failure(() => assertCanDecide(row("pending"), approver, 2))).toBe(
      null,
    );
  });

  it("reports a decided request before a stale version", () => {
    expect(
      failure(() => assertCanDecide(row("approved"), approver, 1)),
    ).toEqual({ status: 409, code: "TIME_OFF_STATUS" });
    expect(failure(() => assertCanDecide(row("pending"), approver, 1))).toEqual(
      { status: 409, code: "TIME_OFF_CHANGED" },
    );
  });

  it("refuses people who cannot approve", () => {
    expect(
      failure(() => assertCanDecide(row("pending"), requester, 2)),
    ).toEqual({ status: 403, code: "MISSING_PERMISSION" });
  });
});
