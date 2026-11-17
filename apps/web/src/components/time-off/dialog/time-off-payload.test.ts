import { describe, expect, it } from "vite-plus/test";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { SELF } from "./time-off-form-values";
import { createTimeOffPayload, updateTimeOffPayload } from "./time-off-payload";

const values = {
  type: "vacation" as const,
  startDate: "2026-11-16",
  endDate: "2026-11-20",
  note: "  Lisbon  ",
  member: SELF,
};

const request = {
  id: "t1",
  userId: "ana",
  type: "vacation",
  status: "pending",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
  note: "Lisbon",
} as TimeOffRequest;

describe("createTimeOffPayload", () => {
  it("requests for yourself without a userId and trims the note", () => {
    expect(createTimeOffPayload(values)).toEqual({
      type: "vacation",
      startDate: "2026-11-16",
      endDate: "2026-11-20",
      note: "Lisbon",
    });
  });

  it("records for another member and leaves out an empty note", () => {
    expect(
      createTimeOffPayload({ ...values, note: "  ", member: "bo" }),
    ).toEqual({
      type: "vacation",
      startDate: "2026-11-16",
      endDate: "2026-11-20",
      userId: "bo",
    });
  });
});

describe("updateTimeOffPayload", () => {
  it("sends only what changed", () => {
    expect(
      updateTimeOffPayload({ ...values, endDate: "2026-11-18" }, request),
    ).toEqual({ endDate: "2026-11-18" });
    expect(
      updateTimeOffPayload({ ...values, type: "sick", note: "" }, request),
    ).toEqual({ type: "sick", note: null });
  });

  it("returns null when nothing changed", () => {
    expect(updateTimeOffPayload(values, request)).toBeNull();
  });
});
