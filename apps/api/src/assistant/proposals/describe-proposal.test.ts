import type { ToolClient } from "@kaneo/mcp/tools";
import { describe, expect, it } from "vite-plus/test";
import type { ReadReceipt } from "../message-types";
import type { ProposalContext } from "../turn/run-tool-calls";
import { ARCHIVED_TASK } from "./archived-task";
import { describeProposal } from "./describe-proposal";
import { createIdLabels } from "./id-labels";

const ENTITIES: Record<string, unknown> = {
  "/api/project/p1": {
    id: "p1",
    name: "Mobile",
    slug: "mob",
    description: null,
  },
  "/api/task/t1": {
    id: "t1",
    title: "Fix login",
    number: 12,
    projectId: "p1",
    status: "to-do",
    priority: "low",
    userId: "u1",
    estimateSeconds: 3600,
    dueDate: "2026-11-20T00:00:00.000Z",
    description: "Steps",
  },
  "/api/task/t2": {
    id: "t2",
    title: "Old work",
    number: 2,
    projectId: "p1",
    status: "archived",
  },
  "/api/milestone/m1": {
    id: "m1",
    title: "Beta",
    description: "Scope",
    leadId: null,
    priority: "medium",
  },
  "/api/project-document/d1": {
    id: "d1",
    projectId: "p1",
    title: "Handbook",
    body: "# Old",
    revision: 3,
  },
  "/api/workspace/ws/members": [
    { id: "u1", name: "Ada" },
    { id: "u2", name: "Grace" },
  ],
  "/api/custom-field/project/p1": [{ id: "cf1", name: "Severity" }],
  "/api/custom-field/task/t1": [{ fieldId: "cf1", value: "minor" }],
};

function labels() {
  const client: ToolClient = {
    async json<T>(path: string) {
      if (!(path in ENTITIES)) throw new Error(`${path}: Not found`);
      return structuredClone(ENTITIES[path]) as T;
    },
  };
  return createIdLabels(client, "ws");
}

const noReads: ProposalContext = {
  transcript: [],
  replayedToolRowIds: new Set(),
};

function readOf(receipt: ReadReceipt): ProposalContext {
  return {
    transcript: [
      {
        id: "read_1",
        role: "tool",
        readReceipts: [receipt],
      } as ProposalContext["transcript"][number],
    ],
    replayedToolRowIds: new Set(["read_1"]),
  };
}

const describeCall = (
  toolName: string,
  args: Record<string, unknown>,
  options: { proposal?: ProposalContext; pinnedKeys?: string[] } = {},
) =>
  describeProposal({
    toolName,
    args,
    modelKeys: Object.keys(args).filter(
      (key) => !(options.pinnedKeys ?? []).includes(key),
    ),
    pinnedKeys: options.pinnedKeys ?? [],
    labels: labels(),
    proposal: options.proposal ?? noReads,
  });

describe("describeProposal", () => {
  it("shows a new task by name, with ids resolved", async () => {
    expect(
      await describeCall("create_task", {
        projectId: "p1",
        title: "Fix signup",
        description: "Repro steps",
        userId: "u2",
        estimateSeconds: 5400,
      }),
    ).toEqual({
      ok: true,
      preview: {
        target: "Mobile",
        targetKey: "projectId",
        fields: [
          { key: "projectId", kind: "ref", value: "Mobile" },
          { key: "title", kind: "text", value: "Fix signup" },
          { key: "description", kind: "markdown", value: "Repro steps" },
          { key: "userId", kind: "ref", value: "Grace" },
          { key: "estimateSeconds", kind: "text", value: "1h 30m" },
        ],
        diff: null,
        nested: null,
      },
      args: {
        projectId: "p1",
        title: "Fix signup",
        description: "Repro steps",
        userId: "u2",
        estimateSeconds: 5400,
      },
    });
  });

  it("never lists pinned arguments", async () => {
    const described = await describeCall(
      "create_project",
      { name: "Web", workspaceId: "ws", icon: "Globe", slug: "web" },
      { pinnedKeys: ["workspaceId"] },
    );
    expect(described.ok && described.preview).toEqual({
      target: "Web",
      targetKey: "name",
      fields: [
        { key: "name", kind: "text", value: "Web" },
        { key: "icon", kind: "text", value: "Globe" },
        { key: "slug", kind: "text", value: "web" },
      ],
      diff: null,
      nested: null,
    });
  });

  it("has no target key without a target", async () => {
    const described = await describeCall("create_label", { color: "#fff" });
    expect(described.ok && described.preview).toMatchObject({
      target: null,
      targetKey: null,
    });
  });

  it("shows what an update replaces", async () => {
    const described = await describeCall("update_task", {
      taskId: "t1",
      title: "Fix login on iOS",
      priority: "high",
      userId: null,
      estimateSeconds: 7200,
    });
    expect(described.ok && described.preview).toEqual({
      target: "MOB-12 Fix login",
      targetKey: "taskId",
      fields: [
        { key: "taskId", kind: "ref", value: "MOB-12 Fix login" },
        {
          key: "title",
          kind: "text",
          value: "Fix login on iOS",
          from: "Fix login",
        },
        { key: "priority", kind: "text", value: "high", from: "low" },
        { key: "userId", kind: "ref", value: "", from: "Ada" },
        { key: "estimateSeconds", kind: "text", value: "2h", from: "1h" },
      ],
      diff: null,
      nested: null,
    });
  });

  it("shows a milestone's previous text and an empty lead as null", async () => {
    const described = await describeCall("update_milestone", {
      milestoneId: "m1",
      description: "New scope",
      leadId: "u1",
    });
    expect(described.ok && described.preview.fields).toEqual([
      { key: "milestoneId", kind: "ref", value: "Beta" },
      {
        key: "description",
        kind: "markdown",
        value: "New scope",
        from: "Scope",
      },
      { key: "leadId", kind: "ref", value: "Ada", from: null },
    ]);
  });

  it("shows a custom field by name with its current value", async () => {
    const described = await describeCall("set_task_custom_field_value", {
      taskId: "t1",
      fieldId: "cf1",
      value: "major",
    });
    expect(described.ok && described.preview.fields).toEqual([
      { key: "taskId", kind: "ref", value: "MOB-12 Fix login" },
      { key: "fieldId", kind: "ref", value: "Severity" },
      { key: "value", kind: "text", value: "major", from: "minor" },
    ]);
  });

  it("shows a due date the change clears", async () => {
    const described = await describeCall("update_task_due_date", {
      taskId: "t1",
    });
    expect(described.ok && described.preview.fields).toEqual([
      { key: "taskId", kind: "ref", value: "MOB-12 Fix login" },
      {
        key: "dueDate",
        kind: "date",
        value: "",
        from: "2026-11-20T00:00:00.000Z",
      },
    ]);
  });

  it("refuses to change an archived task", async () => {
    expect(
      await describeCall("update_task_status", {
        taskId: "t2",
        status: "done",
      }),
    ).toEqual({ ok: false, error: ARCHIVED_TASK });
    expect(
      await describeCall("update_task", { taskId: "t2", title: "Back" }),
    ).toEqual({ ok: false, error: ARCHIVED_TASK });
  });

  it("explains a target it can't read", async () => {
    expect(
      await describeCall("update_task", { taskId: "nope", title: "x" }),
    ).toEqual({
      ok: false,
      error: expect.stringContaining("/api/task/nope: Not found"),
    });
  });

  it("diffs a page rewrite the model read in full and sets its revision", async () => {
    const args = { pageId: "d1", body: "# New", expectedRevision: 1 };
    expect(
      await describeCall("update_project_page", args, {
        proposal: readOf({ kind: "project_page", id: "d1", version: "3" }),
      }),
    ).toEqual({
      ok: true,
      preview: {
        target: "Handbook",
        targetKey: "pageId",
        fields: [{ key: "pageId", kind: "ref", value: "Handbook" }],
        diff: { before: "# Old", after: "# New" },
        nested: null,
      },
      args: { pageId: "d1", body: "# New", expectedRevision: 3 },
    });
  });

  it("refuses a page rewrite without a full read", async () => {
    expect(
      await describeCall("update_project_page", { pageId: "d1", body: "x" }),
    ).toEqual({
      ok: false,
      error: expect.stringContaining("get_project_page"),
    });
  });

  it("diffs an append to a task description", async () => {
    const described = await describeCall("update_task_description", {
      taskId: "t1",
      appendMarkdown: "More",
    });
    expect(described.ok && described.preview.diff).toEqual({
      before: "Steps",
      after: "Steps\n\nMore",
    });
    expect(described.ok && described.preview.fields).toEqual([
      { key: "taskId", kind: "ref", value: "MOB-12 Fix login" },
    ]);
  });

  it("nests a new Feature's milestones and tasks", async () => {
    const described = await describeCall("create_task", {
      projectId: "p1",
      title: "Payments",
      description: "",
      type: "feature",
      featureComposition: {
        milestones: [{ key: "a", title: "Alpha", leadId: "u2" }],
        newTasks: [
          {
            title: "Card form",
            milestoneKey: "a",
            type: "bug",
            estimateSeconds: 1800,
          },
        ],
        existingTasks: [{ id: "t1" }],
      },
    });
    expect(described.ok && described.preview.nested).toEqual({
      milestones: [
        {
          title: "Alpha",
          leadLabel: "Grace",
          releaseLabel: null,
          priority: null,
          tasks: [
            {
              title: "Card form",
              type: "bug",
              estimateSeconds: 1800,
              existing: false,
            },
          ],
        },
      ],
      tasks: [
        {
          title: "MOB-12 Fix login",
          type: null,
          estimateSeconds: null,
          existing: true,
        },
      ],
      unassignedReleaseLabel: null,
    });
    expect(
      described.ok && described.preview.fields.map((field) => field.key),
    ).toEqual(["projectId", "title", "description", "type"]);
  });
});
