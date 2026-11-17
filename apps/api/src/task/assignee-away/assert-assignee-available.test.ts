import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DatedWork } from "./availability-checks";

const mocks = vi.hoisted(() => ({
  readBlockedDays: vi.fn(),
  projects: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
}));
vi.mock("../../time-off/read-blocked-days", () => ({
  readBlockedDays: mocks.readBlockedDays,
}));

const { assertAssigneeAvailable } = await import("./assert-assignee-available");

const tx = {
  select: (...args: unknown[]) => {
    mocks.select(...args);
    return { from: () => ({ where: async () => mocks.projects }) };
  },
} as never;

const work = (values: Partial<DatedWork> = {}): DatedWork => ({
  userId: "ann",
  scheduledAssigneeId: null,
  scheduleSegments: null,
  startDate: null,
  dueDate: null,
  ...values,
});
const change = (
  taskId: string,
  before: DatedWork,
  after: DatedWork,
  projectId = "p1",
) => ({ taskId, projectId, before, after });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects = [{ id: "p1", workspaceId: "w1", planningTimeZone: null }];
  mocks.readBlockedDays.mockResolvedValue(new Map());
});

describe("assertAssigneeAvailable", () => {
  it("reads nothing when no date needs checking", async () => {
    const due = new Date("2027-01-06T00:00:00Z");
    await assertAssigneeAvailable(tx, [
      change("t1", work({ dueDate: due }), work({ dueDate: due })),
      change("t2", work(), work({ userId: null, dueDate: due })),
    ]);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.readBlockedDays).not.toHaveBeenCalled();
  });

  it("reads days in the sender's zone, then the planning zone, then UTC", async () => {
    // Midnight in Berlin, still the 5th in UTC.
    const due = new Date("2027-01-05T23:00:00Z");
    const moved = change("t1", work(), work({ dueDate: due }));
    await assertAssigneeAvailable(tx, [moved], "Europe/Berlin");
    expect(mocks.readBlockedDays).toHaveBeenLastCalledWith(tx, "w1", ["ann"], {
      from: "2027-01-06",
      to: "2027-01-06",
    });
    await assertAssigneeAvailable(tx, [moved]);
    expect(mocks.readBlockedDays).toHaveBeenLastCalledWith(tx, "w1", ["ann"], {
      from: "2027-01-05",
      to: "2027-01-05",
    });
    mocks.projects = [
      { id: "p1", workspaceId: "w1", planningTimeZone: "Europe/Berlin" },
    ];
    await assertAssigneeAvailable(tx, [moved]);
    expect(mocks.readBlockedDays).toHaveBeenLastCalledWith(tx, "w1", ["ann"], {
      from: "2027-01-06",
      to: "2027-01-06",
    });
  });

  it("reads once per year the dates fall in", async () => {
    await assertAssigneeAvailable(tx, [
      change(
        "t1",
        work(),
        work({
          startDate: new Date("2026-12-30T00:00:00Z"),
          dueDate: new Date("2027-01-04T00:00:00Z"),
        }),
      ),
      change(
        "t2",
        work({ userId: "bob" }),
        work({ userId: "bob", dueDate: new Date("2027-02-01T00:00:00Z") }),
      ),
    ]);
    expect(mocks.readBlockedDays.mock.calls).toEqual([
      [tx, "w1", ["ann"], { from: "2026-12-30", to: "2026-12-30" }],
      [tx, "w1", ["ann", "bob"], { from: "2027-01-04", to: "2027-02-01" }],
    ]);
  });

  it("refuses every task with a date on a blocked day, and nothing else", async () => {
    mocks.readBlockedDays.mockResolvedValue(
      new Map([["ann", new Set(["2027-01-06"])]]),
    );
    const on = new Date("2027-01-06T00:00:00Z");
    const off = new Date("2027-01-07T00:00:00Z");
    const refusal = assertAssigneeAvailable(tx, [
      change("t1", work(), work({ dueDate: on })),
      change("t2", work(), work({ dueDate: off })),
      change("t3", work(), work({ startDate: on, dueDate: off })),
    ]);
    await expect(refusal).rejects.toMatchObject({
      status: 409,
      code: "TASK_ASSIGNEE_AWAY",
      issues: [
        { path: "tasks.t1", message: expect.stringContaining("2027-01-06") },
        { path: "tasks.t3", message: expect.stringContaining("2027-01-06") },
      ],
    });
    await expect(
      assertAssigneeAvailable(tx, [
        change("t2", work(), work({ dueDate: off })),
      ]),
    ).resolves.toBeUndefined();
  });
});
