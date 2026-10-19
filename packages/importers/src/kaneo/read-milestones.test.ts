import { describe, expect, it, vi } from "vite-plus/test";
import { SourceHttpError } from "../http.js";
import type { KaneoBoardTask, KaneoClient } from "./client.js";
import { readMilestones } from "./read-milestones.js";
import { mapTask } from "./mapping.js";

const task = (id: string, type: string): KaneoBoardTask => ({
  id,
  type,
  title: id,
  number: 1,
  description: null,
  status: "todo",
  priority: null,
  position: 0,
  userId: null,
});
const milestone = {
  id: "m",
  featureId: "f",
  title: "First",
  description: "Ship",
  startDate: "2026-10-20",
  endDate: "2026-11-01",
  position: 1,
};
describe("Kaneo milestone transfers", () => {
  it("reads Feature-owned milestone definitions including empty milestones", async () => {
    const listMilestones = vi.fn(async () => [milestone]);
    const result = await readMilestones(
      { listMilestones } as unknown as KaneoClient,
      [task("f", "feature"), task("t", "task"), task("b", "bug")],
    );
    expect(listMilestones).toHaveBeenCalledExactlyOnceWith("f");
    expect(result).toEqual([
      {
        key: "m",
        featureKey: "f",
        title: "First",
        description: "Ship",
        startDate: "2026-10-20",
        endDate: "2026-11-01",
        position: 1,
      },
    ]);
    expect(
      mapTask(
        { ...task("b", "bug"), featureId: "f", milestoneId: "m" },
        new Set(["todo"]),
        new Map(),
      ),
    ).toMatchObject({ type: "bug", featureKey: "f", milestoneKey: "m" });
  });
  it("maps legacy targetDate only when the new endDate is omitted", async () => {
    const listMilestones = vi.fn(async () => [
      {
        ...milestone,
        startDate: undefined,
        endDate: undefined,
        targetDate: "2026-11-01",
      },
      { ...milestone, id: "cleared", endDate: null, targetDate: "2026-11-01" },
    ]);
    const imported = await readMilestones(
      { listMilestones } as unknown as KaneoClient,
      [task("f", "feature")],
    );
    expect(imported[0]).toMatchObject({
      startDate: null,
      endDate: "2026-11-01",
    });
    expect(imported[1]).toMatchObject({
      startDate: "2026-10-20",
      endDate: null,
    });
    expect(imported[0]).not.toHaveProperty("targetDate");
  });
  it("supports older sources without the milestone endpoint", async () => {
    const listMilestones = vi.fn(async () => {
      throw new SourceHttpError("Not Found", 404, {});
    });
    expect(
      await readMilestones({ listMilestones } as unknown as KaneoClient, [
        task("f", "feature"),
        task("f2", "feature"),
      ]),
    ).toEqual([]);
    expect(listMilestones).toHaveBeenCalledTimes(1);
  });
  it("does not hide authorization failures", async () => {
    const listMilestones = vi.fn(async () => {
      throw new SourceHttpError("Forbidden", 403, {});
    });
    await expect(
      readMilestones({ listMilestones } as unknown as KaneoClient, [
        task("f", "feature"),
      ]),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("retains explicit empty membership while older sources leave it absent", () => {
    expect(
      mapTask(
        { ...task("t", "task"), featureId: null, milestoneId: null },
        new Set(["todo"]),
        new Map(),
      ),
    ).toMatchObject({ featureKey: null, milestoneKey: null });
  });
  it("other source tasks remain unassigned without explicit references", () => {
    const result = mapTask(task("t", "task"), new Set(["todo"]), new Map());
    expect(result).not.toHaveProperty("featureKey");
    expect(result).not.toHaveProperty("milestoneKey");
  });
});
