import { describe, expect, it } from "vite-plus/test";
import {
  availabilityChecks,
  type DatedWork,
  effectiveAssigneeId,
} from "./availability-checks";

const tue = new Date("2027-01-05T00:00:00Z");
const wed = new Date("2027-01-06T00:00:00Z");
const thu = new Date("2027-01-07T00:00:00Z");
const segments = [
  { start: "2027-01-05T09:00:00.000Z", end: "2027-01-05T17:00:00.000Z" },
];

const manual: DatedWork = {
  userId: "ann",
  scheduledAssigneeId: null,
  scheduleSegments: null,
  startDate: tue,
  dueDate: wed,
};
const planned: DatedWork = {
  userId: "bob",
  scheduledAssigneeId: "ann",
  scheduleSegments: segments,
  startDate: tue,
  dueDate: wed,
};

describe("effectiveAssigneeId", () => {
  it("follows the planned assignee only while the work has segments", () => {
    expect(effectiveAssigneeId(planned)).toBe("ann");
    expect(effectiveAssigneeId({ ...planned, scheduleSegments: [] })).toBe(
      "bob",
    );
    expect(effectiveAssigneeId({ ...planned, scheduleSegments: null })).toBe(
      "bob",
    );
  });
});

describe("availabilityChecks", () => {
  it("checks only the date a write changes", () => {
    expect(availabilityChecks(manual, { ...manual, dueDate: thu })).toEqual({
      assigneeId: "ann",
      endpoints: [{ field: "dueDate", at: thu }],
    });
    expect(availabilityChecks(manual, { ...manual, startDate: wed })).toEqual({
      assigneeId: "ann",
      endpoints: [{ field: "startDate", at: wed }],
    });
  });

  it("treats a date set where there was none as a change", () => {
    expect(
      availabilityChecks(
        { ...manual, startDate: null },
        { ...manual, startDate: tue },
      ),
    ).toEqual({
      assigneeId: "ann",
      endpoints: [{ field: "startDate", at: tue }],
    });
  });

  it("checks every date the work has when it goes to someone else", () => {
    expect(availabilityChecks(manual, { ...manual, userId: "cat" })).toEqual({
      assigneeId: "cat",
      endpoints: [
        { field: "startDate", at: tue },
        { field: "dueDate", at: wed },
      ],
    });
    expect(
      availabilityChecks(
        { ...manual, startDate: null },
        { ...manual, startDate: null, userId: "cat" },
      ),
    ).toEqual({
      assigneeId: "cat",
      endpoints: [{ field: "dueDate", at: wed }],
    });
  });

  it("checks both dates for the assignee when planned work is set by hand", () => {
    // The planned assignee was ann; the work now belongs to bob.
    expect(
      availabilityChecks(planned, {
        ...planned,
        dueDate: thu,
        scheduleSegments: null,
      }),
    ).toEqual({
      assigneeId: "bob",
      endpoints: [
        { field: "startDate", at: tue },
        { field: "dueDate", at: thu },
      ],
    });
    // Same person: only the changed date.
    expect(
      availabilityChecks(
        { ...planned, userId: "ann" },
        { ...planned, userId: "ann", dueDate: thu, scheduleSegments: null },
      ),
    ).toEqual({
      assigneeId: "ann",
      endpoints: [{ field: "dueDate", at: thu }],
    });
  });

  it("skips unassigned and planned work", () => {
    expect(
      availabilityChecks(manual, { ...manual, userId: null, dueDate: thu }),
    ).toBeNull();
    expect(
      availabilityChecks(planned, { ...planned, userId: "cat", dueDate: thu }),
    ).toBeNull();
  });

  it("skips writes that clear dates or change nothing", () => {
    expect(
      availabilityChecks(manual, { ...manual, startDate: null, dueDate: null }),
    ).toBeNull();
    expect(availabilityChecks(manual, { ...manual })).toBeNull();
    expect(
      availabilityChecks(manual, { ...manual, dueDate: new Date(wed) }),
    ).toBeNull();
  });
});
