import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { planImport } from "./import-plan.js";
import { parseTransferDocument } from "./parse-import-file.js";

const document = {
  version: 2,
  project: { name: "Demo", slug: "demo" },
  tasks: [
    {
      key: "f",
      title: "Feature",
      type: "feature",
      status: "planned",
      featureKey: null,
      milestoneKey: null,
      labels: [],
    },
    {
      key: "b",
      title: "Bug",
      type: "bug",
      status: "planned",
      featureKey: "f",
      milestoneKey: "m",
      labels: [{ name: "P0", color: "red" }],
    },
  ],
  milestones: [
    {
      key: "m",
      featureKey: "f",
      title: "Ship",
      description: null,
      startDate: "2026-10-20",
      endDate: "2026-11-01",
      position: 0,
    },
  ],
};
describe("versioned milestone transfers", () => {
  it("retains metadata, portable hierarchy references and labels through status planning", () => {
    const parsed = Result.getOrThrow(
      parseTransferDocument(JSON.stringify(document), "export.json"),
    );
    const plan = planImport(parsed.tasks, []);
    expect(parsed.hierarchy).toEqual({
      version: 2,
      milestones: document.milestones,
    });
    expect(plan.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "b",
          type: "bug",
          featureKey: "f",
          milestoneKey: "m",
          labels: [{ name: "P0", color: "red" }],
        }),
      ]),
    );
    expect(plan.withLabels).toBe(0);
  });
  it("maps prior milestone targetDate to endDate without exporting the retired field", () => {
    const old = {
      ...document,
      milestones: [
        {
          ...document.milestones[0],
          startDate: undefined,
          endDate: undefined,
          targetDate: "2026-11-01",
        },
      ],
    };
    const parsed = Result.getOrThrow(
      parseTransferDocument(JSON.stringify(old), "prior.json"),
    );
    expect(parsed.hierarchy?.milestones[0]).toMatchObject({
      startDate: null,
      endDate: "2026-11-01",
    });
    expect(parsed.hierarchy?.milestones[0]).not.toHaveProperty("targetDate");
    const explicit = {
      ...old,
      milestones: [{ ...old.milestones[0], endDate: null }],
    };
    expect(
      Result.getOrThrow(
        parseTransferDocument(JSON.stringify(explicit), "explicit.json"),
      ).hierarchy?.milestones[0]?.endDate,
    ).toBeNull();
  });
  it("keeps older flat exports without milestone definitions", () => {
    const parsed = Result.getOrThrow(
      parseTransferDocument('[{"title":"Task"}]', "old.json"),
    );
    expect(parsed.hierarchy).toBeUndefined();
    expect(planImport(parsed.tasks, []).tasks).toEqual([
      { title: "Task", status: "planned" },
    ]);
  });
  it("rejects portable hierarchy references without the versioned envelope", () => {
    expect(
      Result.isFailure(
        parseTransferDocument(JSON.stringify(document.tasks), "flat.json"),
      ),
    ).toBe(true);
  });
  it.each([
    { ...document, version: 3 },
    {
      ...document,
      milestones: [{ ...document.milestones[0], startDate: "2026-11-02" }],
    },
    {
      ...document,
      milestones: [{ ...document.milestones[0], startDate: "2026-02-30" }],
    },
    {
      ...document,
      milestones: [{ ...document.milestones[0], endDate: "2026-02-30" }],
    },
    {
      ...document,
      tasks: [document.tasks[0], { ...document.tasks[1], key: "f" }],
    },
    {
      ...document,
      tasks: [
        document.tasks[0],
        { ...document.tasks[1], featureKey: "missing" },
      ],
    },
    {
      ...document,
      tasks: [
        document.tasks[0],
        { ...document.tasks[1], milestoneKey: "missing" },
      ],
    },
    {
      ...document,
      milestones: [{ ...document.milestones[0], featureKey: "b" }],
    },
    { ...document, milestones: undefined },
    { ...document, tasks: [{ ...document.tasks[1], key: undefined }] },
    { ...document, tasks: [{ ...document.tasks[1], milestoneKey: 1 }] },
    { ...document, tasks: [{ ...document.tasks[1], labels: [1] }] },
    {
      ...document,
      milestones: [{ ...document.milestones[0], endDate: "tomorrow" }],
    },
  ])("rejects malformed versioned documents", (value) => {
    expect(
      Result.isFailure(
        parseTransferDocument(JSON.stringify(value), "bad.json"),
      ),
    ).toBe(true);
  });
});
