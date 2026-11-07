import { Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { TaskExport } from "../api/export-import.js";
import { parseTransferDocument } from "./parse-import-file.js";

const author = { name: "Original author", avatar: null };
const dates = {
  createdAt: "2026-11-05T09:00:00.000Z",
  updatedAt: "2026-11-05T10:00:00.000Z",
};
const document = {
  version: 5,
  project: {
    name: "Project",
    slug: "project",
    description: null,
    exportedAt: dates.createdAt,
  },
  releases: [],
  tasks: [
    {
      key: "feature",
      type: "feature",
      title: "Knowledge",
      description: "",
      status: null,
      priority: null,
      startDate: null,
      dueDate: null,
      userId: null,
      labels: [],
    },
  ],
  milestones: [
    {
      key: "milestone",
      featureKey: "feature",
      title: "Delivery",
      description: null,
      position: 0,
      startDate: null,
      endDate: null,
    },
  ],
  featureDocuments: [
    {
      key: "document",
      featureKey: "feature",
      title: "Design",
      body: "# Design\n\n![image](/api/task/assets/image)",
      revision: 3,
      ...dates,
      createdBy: author,
      updatedBy: author,
    },
  ],
  featureUpdates: [
    {
      key: "update",
      featureKey: "feature",
      note: "On schedule",
      health: "on-track",
      ...dates,
      author,
      milestones: [
        {
          key: "milestone",
          title: "Original name",
          position: 0,
          total: 3,
          started: 2,
          completed: 1,
          previousTotal: 2,
          previousCompleted: 0,
        },
        {
          key: "deleted",
          title: "Removed milestone",
          position: 1,
          total: 1,
          started: 1,
          completed: 1,
          previousTotal: null,
          previousCompleted: null,
        },
      ],
    },
  ],
};

describe("native v5 Feature content", () => {
  it("decodes and imports documents and immutable update snapshots without dropping author metadata", () => {
    const exported = Schema.decodeUnknownSync(TaskExport)(document);
    const imported = Result.getOrThrow(
      parseTransferDocument(JSON.stringify(exported), "v5.json"),
    );
    expect(imported.hierarchy).toMatchObject({
      version: 5,
      featureDocuments: document.featureDocuments,
      featureUpdates: document.featureUpdates,
    });
  });

  it.each([
    { version: undefined },
    { version: 4 },
    {
      featureDocuments: [
        { ...document.featureDocuments[0], featureKey: "missing" },
      ],
    },
    { featureDocuments: [{ ...document.featureDocuments[0], revision: 0 }] },
    {
      featureDocuments: [
        { ...document.featureDocuments[0], createdAt: "yesterday" },
      ],
    },
    {
      featureDocuments: [
        ...document.featureDocuments,
        ...document.featureDocuments,
      ],
    },
    { featureUpdates: [{ ...document.featureUpdates[0], health: "done" }] },
    { featureUpdates: [{ ...document.featureUpdates[0], note: " " }] },
    {
      featureUpdates: [
        {
          ...document.featureUpdates[0],
          milestones: [
            { ...document.featureUpdates[0]!.milestones[0], completed: -1 },
          ],
        },
      ],
    },
    {
      featureUpdates: [...document.featureUpdates, ...document.featureUpdates],
    },
  ])("rejects malformed content instead of silently stripping it", (patch) => {
    expect(
      Result.isFailure(
        parseTransferDocument(
          JSON.stringify({ ...document, ...patch }),
          "bad.json",
        ),
      ),
    ).toBe(true);
  });

  it("rejects a snapshot referencing another imported Feature's milestone", () => {
    expect(
      Result.isFailure(
        parseTransferDocument(
          JSON.stringify({
            ...document,
            tasks: [...document.tasks, { ...document.tasks[0], key: "other" }],
            milestones: [{ ...document.milestones[0], featureKey: "other" }],
          }),
          "bad.json",
        ),
      ),
    ).toBe(true);
  });
});
