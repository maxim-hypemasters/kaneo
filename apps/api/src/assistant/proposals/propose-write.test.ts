import type { ToolClient } from "@kaneo/mcp/tools";
import { describe, expect, it, vi } from "vite-plus/test";
import { MAX_PROPOSALS_PER_STEP } from "../constants";
import { createAssistantTools } from "../tools/assistant-tools";
import type { ProposalContext } from "../turn/run-tool-calls";
import { WRITE_NOT_PERMITTED } from "../turn/run-tool-calls";
import { createProposeWrite, TOO_MANY_PROPOSALS } from "./propose-write";

const ENTITIES: Record<string, unknown> = {
  "/api/project/p1": { id: "p1", name: "Mobile", slug: "mob" },
  "/api/task/t1": {
    id: "t1",
    title: "Fix login",
    number: 12,
    projectId: "p1",
    status: "to-do",
    description: "Steps",
  },
  "/api/triage/project/p1/members": { userIds: [] },
};

function setup(can: () => boolean = () => true) {
  const json = vi.fn(async (path: string) => {
    if (!(path in ENTITIES)) throw new Error(`${path}: Not found`);
    return ENTITIES[path];
  });
  const client = { json } as unknown as ToolClient;
  const tools = createAssistantTools({
    workspaceId: "ws",
    can,
    client,
    mode: "read",
  });
  return {
    json,
    propose: createProposeWrite({
      tools,
      readClient: client,
      workspaceId: "ws",
      userId: "u1",
      timeZone: "Europe/Berlin",
    }),
  };
}

const step = (): ProposalContext => ({
  transcript: [],
  replayedToolRowIds: new Set(),
});

const call = (name: string, args: unknown, id = "call_1") => ({
  id,
  name,
  arguments: typeof args === "string" ? args : JSON.stringify(args),
});

describe("createProposeWrite", () => {
  it("turns a write into a pending proposal without writing", async () => {
    const { propose, json } = setup();
    const draft = await propose(
      call("create_task", { projectId: "p1", title: "Fix", description: "" }),
      step(),
    );
    expect(draft).toMatchObject({
      content: "",
      isError: false,
      approval: "pending",
      preview: { target: "Mobile" },
    });
    expect(JSON.parse(draft.toolArgs ?? "{}")).toMatchObject({
      projectId: "p1",
      title: "Fix",
    });
    for (const [, init] of json.mock.calls as unknown as [
      string,
      RequestInit,
    ][])
      expect(init?.method ?? "GET").toBe("GET");
  });

  it("runs date and assignee changes in the person's time zone", async () => {
    const { propose } = setup();
    const draft = await propose(
      call("update_task_due_date", {
        taskId: "t1",
        dueDate: "2026-12-24T00:00:00+01:00",
        timeZone: "Pacific/Auckland",
      }),
      step(),
    );
    expect(draft.approval).toBe("pending");
    // The model's zone is dropped; the turn's zone runs the change.
    expect(JSON.parse(draft.toolArgs ?? "{}")).toMatchObject({
      taskId: "t1",
      timeZone: "Europe/Berlin",
    });
    expect(
      draft.preview?.fields.some((field) => field.key === "timeZone"),
    ).toBe(false);

    const create = await propose(
      call("create_task", { projectId: "p1", title: "Fix", description: "" }),
      step(),
    );
    expect(JSON.parse(create.toolArgs ?? "{}")).not.toHaveProperty("timeZone");
  });

  it("pins the workspace and keeps it off the card", async () => {
    const { propose } = setup();
    const draft = await propose(
      call("create_label", { name: "urgent", color: "#FF0000" }),
      step(),
    );
    expect(JSON.parse(draft.toolArgs ?? "{}")).toMatchObject({
      workspaceId: "ws",
    });
    expect(draft.preview?.fields.map((field) => field.key)).toEqual([
      "name",
      "color",
    ]);
  });

  it("refuses writes the caller may not make", async () => {
    const { propose } = setup(() => false);
    expect(
      await propose(
        call("create_task", { projectId: "p1", title: "x", description: "" }),
        step(),
      ),
    ).toMatchObject({ content: WRITE_NOT_PERMITTED, isError: true });
  });

  it("returns invalid arguments and refused proposals as errors", async () => {
    const { propose } = setup();
    expect(
      await propose(call("create_task", { title: "x" }), step()),
    ).toMatchObject({ isError: true, approval: null });
    // An expectation the model sends anyway is ignored, not trusted.
    for (const args of [
      { taskId: "t1", description: "New" },
      { taskId: "t1", description: "New", expectedDescription: "Steps" },
    ])
      expect(
        await propose(call("update_task_description", args), step()),
      ).toMatchObject({
        isError: true,
        approval: null,
        content: expect.stringContaining("get_task_description"),
      });
  });

  it("caps the proposals of one step", async () => {
    const { propose } = setup();
    const context = step();
    const drafts = await Promise.all(
      Array.from({ length: MAX_PROPOSALS_PER_STEP + 1 }, (_, index) =>
        propose(
          call(
            "create_task",
            { projectId: "p1", title: `Task ${index}`, description: "" },
            `call_${index}`,
          ),
          context,
        ),
      ),
    );
    expect(drafts.slice(0, -1).every((d) => d.approval === "pending")).toBe(
      true,
    );
    expect(drafts.at(-1)).toMatchObject({
      content: TOO_MANY_PROPOSALS,
      isError: true,
    });
    // A new step starts counting again.
    expect(
      await propose(
        call("create_task", { projectId: "p1", title: "x", description: "" }),
        step(),
      ),
    ).toMatchObject({ approval: "pending" });
  });
});
