import type { ToolClient } from "@kaneo/mcp/tools";
import { describe, expect, it } from "vite-plus/test";
import type { ReadReceipt } from "../message-types";
import type { ProposalContext } from "../turn/run-tool-calls";
import { ARCHIVED_TASK } from "./archived-task";
import { describeProposal } from "./describe-proposal";
import { createIdLabels } from "./id-labels";
import { NESTED_TRIAGE_NOTE, TRIAGE_NOTE } from "./triage-fields";
import { TRIAGE_TASK } from "./triage-task";

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
  "/api/triage/project/p1/members": { userIds: [] },
  // Support triages its new work: Grace decides, everyone else waits.
  "/api/project/p2": { id: "p2", name: "Support", slug: "sup" },
  "/api/triage/project/p2/members": { userIds: ["u2"] },
  "/api/task/t3": {
    id: "t3",
    title: "Crash report",
    number: 3,
    projectId: "p2",
    status: "triage",
  },
  "/api/task/f2": {
    id: "f2",
    title: "Payments",
    number: 4,
    projectId: "p2",
    type: "feature",
    status: null,
  },
  // A project whose triage members can't be read.
  "/api/project/p3": { id: "p3", name: "Locked", slug: "loc" },
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
  options: {
    proposal?: ProposalContext;
    pinnedKeys?: string[];
    userId?: string;
  } = {},
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
    userId: options.userId ?? "u1",
  });

/** The keys of a card's fields, or the refusal. */
const fieldKeys = (result: Awaited<ReturnType<typeof describeCall>>) =>
  result.ok ? result.preview.fields.map((field) => field.key) : result.error;

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
  it("shows a new task from outside triage in triage, with a note", async () => {
    const args = {
      projectId: "p2",
      title: "Export fails",
      description: "",
      status: "in-progress",
      type: "bug",
    };
    expect(await describeCall("create_task", args)).toEqual({
      ok: true,
      preview: {
        target: "Support",
        targetKey: "projectId",
        fields: [
          { key: "projectId", kind: "ref", value: "Support" },
          { key: "title", kind: "text", value: "Export fails" },
          { key: "description", kind: "markdown", value: "" },
          { key: "status", kind: "text", value: "triage", from: "in-progress" },
          { key: "type", kind: "text", value: "bug" },
          { key: "triage", kind: "text", value: TRIAGE_NOTE },
        ],
        diff: null,
        nested: null,
      },
      // The API routes it; the arguments run as the model set them.
      args,
    });
  });

  it("adds the triage status when the model sets none", async () => {
    const described = await describeCall("create_task", {
      projectId: "p2",
      title: "Export fails",
      description: "",
    });
    expect(described.ok && described.preview.fields.slice(-2)).toEqual([
      { key: "status", kind: "text", value: "triage" },
      { key: "triage", kind: "text", value: TRIAGE_NOTE },
    ]);
  });

  it("keeps the status for triage members and projects without triage", async () => {
    const args = {
      projectId: "p2",
      title: "Export fails",
      description: "",
      status: "in-progress",
    };
    for (const [described, project] of [
      [await describeCall("create_task", args, { userId: "u2" }), "p2"],
      [await describeCall("create_task", { ...args, projectId: "p1" }), "p1"],
    ] as const) {
      expect(described.ok && described.preview.fields, project).toContainEqual({
        key: "status",
        kind: "text",
        value: "in-progress",
      });
      expect(
        described.ok &&
          described.preview.fields.some((field) => field.key === "triage"),
        project,
      ).toBe(false);
    }
  });

  it("notes the new work a Feature or milestone brings into triage", async () => {
    const feature = await describeCall("create_task", {
      projectId: "p2",
      title: "Payments",
      description: "",
      type: "feature",
      featureComposition: { newTasks: [{ title: "Card form" }] },
    });
    expect(fieldKeys(feature)).toEqual([
      "projectId",
      "title",
      "description",
      "type",
      "triage",
    ]);
    expect(feature.ok && feature.preview.fields.at(-1)).toEqual({
      key: "triage",
      kind: "text",
      value: NESTED_TRIAGE_NOTE,
    });

    const milestone = await describeCall("create_milestone", {
      featureId: "f2",
      title: "Beta",
      newTasks: [{ title: "Receipts", type: "bug" }],
    });
    expect(milestone.ok && milestone.preview.fields.at(-1)).toEqual({
      key: "triage",
      kind: "text",
      value: NESTED_TRIAGE_NOTE,
    });

    // A Feature alone never waits in Triage.
    const alone = await describeCall("create_task", {
      projectId: "p2",
      title: "Payments",
      description: "",
      type: "feature",
    });
    expect(fieldKeys(alone)).toEqual([
      "projectId",
      "title",
      "description",
      "type",
    ]);
  });

  it("refuses new work whose triage members it can't read", async () => {
    for (const [toolName, args] of [
      ["create_task", { projectId: "p3", title: "x", description: "" }],
      [
        "create_milestone",
        { featureId: "nope", title: "x", newTasks: [{ title: "y" }] },
      ],
    ] as const) {
      expect(await describeCall(toolName, args), toolName).toEqual({
        ok: false,
        error: expect.stringContaining("triage members"),
      });
    }
  });

  it("refuses to change the status of a task waiting in Triage", async () => {
    expect(
      await describeCall("update_task_status", {
        taskId: "t3",
        status: "done",
      }),
    ).toEqual({ ok: false, error: TRIAGE_TASK });
    expect(
      await describeCall("update_task", { taskId: "t3", status: "to-do" }),
    ).toEqual({ ok: false, error: TRIAGE_TASK });
    expect(
      await describeCall("update_task", { taskId: "t3", title: "Crash" }),
    ).toMatchObject({ ok: true });
  });
});
