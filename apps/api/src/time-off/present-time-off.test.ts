import { describe, expect, it } from "vite-plus/test";
import { NO_HOLIDAYS } from "./count-workdays";
import {
  presentEntry,
  presentRequest,
  type TimeOffRow,
} from "./present-time-off";
import type { TimeOffActionViewer } from "./time-off-actions";

const createdAt = new Date("2026-11-01T10:00:00Z");
const updatedAt = new Date("2026-11-02T10:00:00Z");

const row: TimeOffRow = {
  id: "off-1",
  workspaceId: "ws",
  userId: "ana",
  type: "sick",
  status: "pending",
  startDate: "2026-12-28",
  endDate: "2027-01-08",
  note: "Surgery",
  version: 2,
  createdBy: "ana",
  statusChangedBy: null,
  statusChangedAt: null,
  planningKey: "off-1:2026-12-28:2027-01-08",
  createdAt,
  updatedAt,
};

const viewer = (userId: string, canApprove = false): TimeOffActionViewer => ({
  userId,
  canApprove,
  canCreate: true,
  today: "2026-11-14",
});

const requestKeys = [
  "canCancel",
  "canDecide",
  "canEdit",
  "createdAt",
  "createdBy",
  "days",
  "daysByYear",
  "endDate",
  "id",
  "note",
  "startDate",
  "status",
  "statusChangedAt",
  "statusChangedBy",
  "type",
  "updatedAt",
  "userId",
  "version",
  "workspaceId",
];

describe("presentRequest", () => {
  it("returns the full request with days, years, version and actions", () => {
    expect(presentRequest(row, viewer("ana"), NO_HOLIDAYS)).toEqual({
      id: "off-1",
      workspaceId: "ws",
      userId: "ana",
      type: "sick",
      status: "pending",
      startDate: "2026-12-28",
      endDate: "2027-01-08",
      days: 10,
      daysByYear: [
        { year: 2026, days: 4 },
        { year: 2027, days: 6 },
      ],
      note: "Surgery",
      version: 2,
      createdBy: "ana",
      statusChangedBy: null,
      statusChangedAt: null,
      createdAt,
      updatedAt,
      canEdit: true,
      canCancel: true,
      canDecide: false,
    });
  });

  it("leaves the member's calendar holidays out of the day counts", () => {
    const holidays = new Set(["2026-12-31", "2027-01-01", "2027-01-06"]);
    expect(presentRequest(row, viewer("ana"), holidays)).toMatchObject({
      days: 7,
      daysByYear: [
        { year: 2026, days: 3 },
        { year: 2027, days: 4 },
      ],
    });
  });

  it("never copies columns it does not list", () => {
    const withExtra = { ...row, secret: "x" } as TimeOffRow;
    expect(
      Object.keys(presentRequest(withExtra, viewer("ana"), NO_HOLIDAYS)).sort(),
    ).toEqual(requestKeys);
  });
});

describe("presentEntry", () => {
  it("never shows other members the day count, even with holidays", () => {
    const entry = presentEntry(row, viewer("ben"), new Set(["2027-01-01"]));
    expect(entry).not.toHaveProperty("days");
    expect(entry).not.toHaveProperty("type");
  });

  it("shows other members only who is away and when", () => {
    const entry = presentEntry(row, viewer("ben"), NO_HOLIDAYS);
    expect(entry).toEqual({
      id: "off-1",
      userId: "ana",
      startDate: "2026-12-28",
      endDate: "2027-01-08",
    });
    expect(Object.keys(entry).sort()).toEqual([
      "endDate",
      "id",
      "startDate",
      "userId",
    ]);
  });

  it("shows the person away their full entry", () => {
    expect(
      Object.keys(presentEntry(row, viewer("ana"), NO_HOLIDAYS)).sort(),
    ).toEqual(requestKeys);
  });

  it("shows approvers the full entry with decide rights", () => {
    expect(presentEntry(row, viewer("olga", true), NO_HOLIDAYS)).toMatchObject({
      type: "sick",
      note: "Surgery",
      status: "pending",
      canDecide: true,
    });
  });
});
