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
  it("preserves version 3 milestone planning, release references, Feature archive and immutable snapshots", () => {
    const release = {
      key: "r",
      name: "Release",
      startDate: "2026-10-20",
      codeFreezeDate: "2026-10-25",
      submissionDate: "2026-11-01",
    };
    const snapshot = {
      createdAt: "2026-10-19T00:00:00Z",
      projectId: "old-project",
      status: "in-progress",
      priority: "high",
      releaseName: "Old release",
    };
    const value = {
      ...document,
      version: 3,
      releases: [release],
      tasks: [
        {
          ...document.tasks[0],
          status: null,
          archivedAt: "2026-10-20T00:00:00Z",
          planningSnapshots: [snapshot],
        },
        { ...document.tasks[1], releaseKey: "r" },
      ],
      milestones: [
        {
          ...document.milestones[0],
          leadId: "lead",
          status: "in-progress",
          priority: "urgent",
          releaseKey: "r",
        },
      ],
    };
    const parsed = Result.getOrThrow(
      parseTransferDocument(JSON.stringify(value), "knowledge.json"),
    );
    const plan = planImport(parsed.tasks, []);
    expect(parsed.hierarchy).toMatchObject({
      version: 3,
      releases: [release],
      milestones: value.milestones,
    });
    expect(plan.tasks[0]).toMatchObject({
      status: null,
      archivedAt: "2026-10-20T00:00:00Z",
      planningSnapshots: [snapshot],
    });
    expect(plan.tasks[1]).toMatchObject({
      releaseKey: "r",
      featureKey: "f",
      milestoneKey: "m",
    });
  });
  it.each([
    {
      releases: [
        {
          key: "r",
          name: "Invalid",
          startDate: "2026-10-25",
          codeFreezeDate: "2026-10-20",
          submissionDate: "2026-11-01",
        },
      ],
    },
    { releases: "invalid" },
    { milestones: [{ ...document.milestones[0], releaseKey: "missing" }] },
    { tasks: [{ ...document.tasks[0], planningSnapshots: ["invalid"] }] },
    { tasks: [{ ...document.tasks[0], planningSnapshots: [{ status: 3 }] }] },
    { tasks: [{ ...document.tasks[0], archivedAt: "tomorrow" }] },
  ])(
    "rejects malformed version 3 planning metadata without dropping it",
    (patch) => {
      expect(
        Result.isFailure(
          parseTransferDocument(
            JSON.stringify({ ...document, version: 3, ...patch }),
            "bad.json",
          ),
        ),
      ).toBe(true);
    },
  );
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
    { ...document, version: 4 },
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
