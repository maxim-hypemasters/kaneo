import type { ToolClient } from "@kaneo/mcp/tools";
import { describe, expect, it, vi } from "vite-plus/test";
import type { PermissionMap } from "../../utils/role-permissions";
import { DOCUMENT_RESULT_MAX_CHARS, TOOL_RESULT_MAX_CHARS } from "../constants";
import { createAssistantTools } from "./assistant-tools";

// A permission check for a role holding exactly `granted`.
function role(granted: PermissionMap) {
  return (required: PermissionMap) =>
    Object.entries(required).every(([resource, actions]) =>
      actions.every((action) => granted[resource]?.includes(action)),
    );
}

const memberRole = role({
  task: ["create", "read", "update"],
  bug: ["create", "read", "update"],
  feature: ["create", "read", "update"],
  milestone: ["create", "read", "update"],
  document: ["create", "read", "update"],
  label: ["create", "read", "update"],
  project: ["create", "read"],
});
const adminRole = role({
  task: ["create", "read", "update", "assign"],
  bug: ["create", "read", "update"],
  feature: ["create", "read", "update"],
  milestone: ["create", "read", "update"],
  document: ["create", "read", "update"],
  label: ["create", "read", "update"],
  project: ["create", "read", "update", "edit_details"],
});
const viewerRole = role({ task: ["read"], project: ["read"] });

function tools(
  can: (permissions: PermissionMap) => boolean = memberRole,
  mode: "read" | "write" = "read",
) {
  const json = vi.fn(async () => ({}));
  const client: ToolClient = { json } as ToolClient;
  return {
    json,
    tools: createAssistantTools({ workspaceId: "ws-1", can, client, mode }),
  };
}

const names = (definitions: { function: { name: string } }[]) =>
  definitions.map((definition) => definition.function.name);

describe("offered", () => {
  it("offers every read, and no write to a viewer", () => {
    const viewer = names(tools(viewerRole).tools.offered());
    expect(viewer).toContain("get_task");
    expect(viewer).toContain("search");
    for (const name of viewer)
      expect(tools(viewerRole).tools.lookup(name)?.readOnly).toBe(true);
  });

  it("filters writes by the caller's permissions", () => {
    const member = names(tools(memberRole).tools.offered());
    expect(member).toEqual(
      expect.arrayContaining(["create_task", "update_project_page"]),
    );
    for (const name of [
      "update_task_assignee",
      "create_release",
      "update_project_details",
    ])
      expect(member).not.toContain(name);

    const admin = names(tools(adminRole).tools.offered());
    expect(admin).toEqual(
      expect.arrayContaining([
        "update_task_assignee",
        "create_release",
        "update_project_details",
      ]),
    );
  });

  it("drops assignee fields for callers who cannot assign", () => {
    const field = (can: (p: PermissionMap) => boolean) => {
      const definition = tools(can)
        .tools.offered()
        .find((d) => d.function.name === "create_task");
      return Object.keys(
        definition?.function.parameters.properties as object,
      ).includes("userId");
    };
    expect(field(memberRole)).toBe(false);
    expect(field(adminRole)).toBe(true);
  });
});

describe("lookup", () => {
  it("describes allowed tools and hides excluded ones", () => {
    const { tools: assistant } = tools();
    expect(assistant.lookup("delete_task")).toBeNull();
    expect(assistant.lookup("whoami")).toBeNull();
    expect(assistant.lookup("nope")).toBeNull();

    expect(assistant.lookup("get_project_page")).toMatchObject({
      readOnly: true,
      permitted: true,
      documentField: "body",
      maxResultChars: DOCUMENT_RESULT_MAX_CHARS,
    });
    expect(assistant.lookup("list_tasks")).toMatchObject({
      readOnly: true,
      documentField: undefined,
      maxResultChars: TOOL_RESULT_MAX_CHARS,
    });
    expect(assistant.lookup("update_project_page")).toMatchObject({
      readOnly: false,
      permitted: true,
      documentField: undefined,
      entry: { document: "project_page" },
    });
    expect(assistant.lookup("create_release")?.permitted).toBe(false);
  });

  it("refuses writes unsent in read mode", async () => {
    const { json, tools: assistant } = tools(adminRole, "read");
    const result = await assistant
      .lookup("create_task_comment")
      ?.run({ taskId: "t1", content: "Hi" });
    expect(result?.isError).toBe(true);
    expect(json).not.toHaveBeenCalled();
  });

  it("runs writes in write mode", async () => {
    const { json, tools: assistant } = tools(adminRole, "write");
    await assistant
      .lookup("create_task_comment")
      ?.run({ taskId: "t1", content: "Hi" });
    expect(json).toHaveBeenCalledWith("/api/comment/t1", {
      method: "POST",
      body: JSON.stringify({ content: "Hi" }),
    });
  });
});

describe("prepareArgs", () => {
  const { tools: member } = tools(memberRole);
  const { tools: admin } = tools(adminRole);

  it("rejects unknown tools and invalid JSON", () => {
    expect(member.prepareArgs("delete_task", "{}")).toMatchObject({
      ok: false,
    });
    expect(member.prepareArgs("get_task", '{"taskId":')).toEqual({
      ok: false,
      error: "The arguments are not valid JSON. Send one JSON object.",
    });
    for (const raw of ["[]", "null", '"t1"', "3"])
      expect(member.prepareArgs("get_task", raw)).toEqual({
        ok: false,
        error: "The arguments must be a JSON object.",
      });
  });

  it("treats empty arguments as an empty object", () => {
    expect(member.prepareArgs("list_workspace_activity", "")).toEqual({
      ok: true,
      args: { workspaceId: "ws-1" },
      argsJson: '{"workspaceId":"ws-1"}',
    });
  });

  it("refuses omitted fields", () => {
    const prepared = admin.prepareArgs(
      "update_task",
      JSON.stringify({ taskId: "t1", description: "New" }),
    );
    expect(prepared).toMatchObject({ ok: false });
    expect(!prepared.ok && prepared.error).toContain('"description"');
  });

  it("drops server-set fields the model sends anyway", () => {
    expect(
      admin.prepareArgs(
        "update_project_page",
        JSON.stringify({
          pageId: "d1",
          appendMarkdown: "x",
          expectedRevision: 7,
        }),
      ),
    ).toEqual({
      ok: true,
      args: { pageId: "d1", appendMarkdown: "x" },
      argsJson: '{"pageId":"d1","appendMarkdown":"x"}',
    });
  });

  it("validates what `fill` adds", () => {
    const raw = JSON.stringify({ taskId: "t1", description: "New" });
    expect(admin.prepareArgs("update_task_description", raw)).toMatchObject({
      ok: false,
    });
    expect(
      admin.prepareArgs("update_task_description", raw, (args) => ({
        ...args,
        expectedDescription: "",
      })),
    ).toMatchObject({
      ok: true,
      args: { taskId: "t1", description: "New", expectedDescription: "" },
    });
  });

  it("refuses assignee fields without task:assign", () => {
    for (const [name, args] of [
      [
        "create_task",
        { projectId: "p1", title: "A", description: "", userId: "u1" },
      ],
      ["update_task", { taskId: "t1", userId: null }],
      ["create_milestone", { featureId: "f1", title: "M", leadId: "u1" }],
      [
        "create_task",
        {
          projectId: "p1",
          title: "F",
          description: "",
          type: "feature",
          featureComposition: {
            milestones: [{ key: "a", title: "A", leadId: "u1" }],
          },
        },
      ],
    ] as const) {
      const prepared = member.prepareArgs(name, JSON.stringify(args));
      expect(prepared, name).toMatchObject({ ok: false });
      expect(!prepared.ok && prepared.error, name).toMatch(/assign/);
    }
    expect(
      admin.prepareArgs(
        "create_task",
        JSON.stringify({
          projectId: "p1",
          title: "A",
          description: "",
          userId: "u1",
        }),
      ),
    ).toMatchObject({ ok: true, args: { userId: "u1" } });
  });

  it("refuses the archived and triage statuses", () => {
    for (const [status, message] of [
      ["archived", /archive/],
      ["triage", /into Triage/],
    ] as const) {
      for (const [name, args] of [
        ["update_task_status", { taskId: "t1", status }],
        ["update_task", { taskId: "t1", status }],
        [
          "create_task",
          { projectId: "p1", title: "A", description: "", status },
        ],
      ] as const) {
        const prepared = admin.prepareArgs(name, JSON.stringify(args));
        expect(prepared, `${name} ${status}`).toMatchObject({ ok: false });
        expect(!prepared.ok && prepared.error, name).toMatch(message);
      }
    }
    expect(
      admin.prepareArgs(
        "update_task_status",
        JSON.stringify({ taskId: "t1", status: "done" }),
      ),
    ).toMatchObject({ ok: true });
  });

  it("injects pins over the model's value, and defaults when absent", () => {
    expect(
      member.prepareArgs(
        "list_projects",
        JSON.stringify({ workspaceId: "ws-other", includeArchived: true }),
      ),
    ).toEqual({
      ok: true,
      args: { workspaceId: "ws-1", includeArchived: true },
      argsJson: '{"workspaceId":"ws-1","includeArchived":true}',
    });
    expect(
      member.prepareArgs(
        "list_task_activity",
        JSON.stringify({ taskId: "t1" }),
      ),
    ).toMatchObject({ ok: true, args: { taskId: "t1", limit: 50 } });
    expect(
      member.prepareArgs(
        "list_task_activity",
        JSON.stringify({ taskId: "t1", limit: 5 }),
      ),
    ).toMatchObject({ ok: true, args: { limit: 5 } });
  });

  it("validates with the tool's schema", () => {
    const missing = member.prepareArgs("get_task", "{}");
    expect(missing).toMatchObject({ ok: false });
    expect(!missing.ok && missing.error).toContain("taskId");

    const strict = member.prepareArgs(
      "create_project_page",
      JSON.stringify({ projectId: "p1", title: "Doc", extra: true }),
    );
    expect(strict).toMatchObject({ ok: false });

    // The executed arguments are the parsed ones: trimmed, with defaults.
    expect(
      member.prepareArgs(
        "create_project_page",
        JSON.stringify({ projectId: " p1 ", title: " Doc " }),
      ),
    ).toEqual({
      ok: true,
      args: { projectId: "p1", title: "Doc", body: "" },
      argsJson: '{"projectId":"p1","title":"Doc","body":""}',
    });
  });
});
