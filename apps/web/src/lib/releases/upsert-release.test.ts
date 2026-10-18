import { describe, expect, it } from "vite-plus/test";
import type { Release } from "@/types/release";
import { EMPTY_RELEASE_PROGRESS, upsertRelease } from "./upsert-release";

const release = (
  id: string,
  startDate: string,
  values: Partial<Release> = {},
): Release => ({
  id,
  projectId: "p",
  name: id,
  description: null,
  startDate,
  codeFreezeDate: startDate,
  submissionDate: startDate,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  progress: EMPTY_RELEASE_PROGRESS,
  ...values,
});

describe("upsertRelease", () => {
  it("adds a created release in start order with empty progress", () => {
    const { progress: _progress, ...created } = release("b", "2026-11-01");
    const next = upsertRelease(
      [release("a", "2026-10-01"), release("c", "2026-12-01")],
      created,
    );
    expect(next.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(next[1].progress).toEqual(EMPTY_RELEASE_PROGRESS);
  });

  it("replaces an updated release, keeps its progress and re-sorts", () => {
    const progress = {
      tasks: { total: 3, completed: 1 },
      features: { total: 1, completed: 0 },
      unfinished: 3,
    };
    const { progress: _progress, ...updated } = release("a", "2027-01-01", {
      name: "Renamed",
    });
    const next = upsertRelease(
      [release("a", "2026-10-01", { progress }), release("c", "2026-12-01")],
      updated,
    );
    expect(next.map((item) => item.id)).toEqual(["c", "a"]);
    expect(next[1]).toMatchObject({ name: "Renamed", progress });
  });
});
