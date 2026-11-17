import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const readBlockedDays = vi.hoisted(() => vi.fn());
vi.mock("../time-off/read-blocked-days", () => ({ readBlockedDays }));

const { placeMovedWork } = await import("./place-moved-work");

const tx = {} as never;
const at = (iso: string) => new Date(iso);
const project = { workspaceId: "w1", timeZone: "UTC" };
// Eight planned hours: Monday afternoon and Tuesday morning.
const planned = {
  startDate: at("2027-01-04T13:00:00Z"),
  dueDate: at("2027-01-05T13:00:00Z"),
  scheduledAssigneeId: "ann",
  scheduleSegments: [
    { start: "2027-01-04T13:00:00.000Z", end: "2027-01-04T17:00:00.000Z" },
    { start: "2027-01-05T09:00:00.000Z", end: "2027-01-05T13:00:00.000Z" },
  ],
};
const target = {
  start: at("2027-01-07T13:00:00Z"),
  end: at("2027-01-08T13:00:00Z"),
};

beforeEach(() => {
  readBlockedDays.mockReset();
  readBlockedDays.mockResolvedValue(new Map());
});

describe("placeMovedWork", () => {
  it("reads the planned assignee's days away once, over the whole horizon", async () => {
    readBlockedDays.mockResolvedValue(
      new Map([["ann", new Set(["2027-01-08"])]]),
    );
    const placement = await placeMovedWork(tx, planned, target, project, false);
    expect(readBlockedDays).toHaveBeenCalledTimes(1);
    expect(readBlockedDays).toHaveBeenCalledWith(tx, "w1", ["ann"], {
      from: "2027-01-06",
      to: "2037-01-15",
    });
    expect(placement?.scheduleSegments).toEqual([
      { start: "2027-01-07T13:00:00.000Z", end: "2027-01-07T17:00:00.000Z" },
      { start: "2027-01-11T09:00:00.000Z", end: "2027-01-11T13:00:00.000Z" },
    ]);
  });

  it("starts the window on the local day before the target", async () => {
    await placeMovedWork(
      tx,
      planned,
      { start: at("2027-01-06T23:30:00Z"), end: target.end },
      { workspaceId: "w1", timeZone: "Europe/Berlin" },
      false,
    );
    expect(readBlockedDays.mock.calls[0]?.[3]).toMatchObject({
      from: "2027-01-06",
    });
  });

  it("reads nothing for hand-set spans, unplanned work or work with no planned assignee", async () => {
    expect(await placeMovedWork(tx, planned, target, project, true)).toEqual({
      startDate: target.start,
      dueDate: target.end,
      scheduleSegments: null,
    });
    await placeMovedWork(
      tx,
      { ...planned, scheduleSegments: [] },
      target,
      project,
      false,
    );
    await placeMovedWork(
      tx,
      { ...planned, scheduledAssigneeId: null },
      target,
      project,
      false,
    );
    expect(readBlockedDays).not.toHaveBeenCalled();
  });
});
