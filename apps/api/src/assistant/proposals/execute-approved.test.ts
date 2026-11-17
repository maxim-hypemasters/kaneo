import type { ToolClient } from "@kaneo/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vite-plus/test";
import type { InternalRequestOutcome } from "../../utils/internal-api-client";
import type { AssistantProposalPreview } from "../message-types";
import type {
  AssistantToolHandle,
  AssistantTools,
} from "../tools/assistant-tools";
import { ARCHIVED_SINCE } from "./archived-task";
import {
  CHANGED_SINCE,
  type ExecutionDeps,
  executeApproved,
  GUARD_UNREADABLE,
  NOT_RUNNABLE,
  OUTCOME_UNKNOWN,
} from "./execute-approved";

const READS: Record<string, unknown> = {
  "/api/project/p1": {
    id: "p1",
    name: "Mobile",
    slug: "mob",
    description: "Old",
  },
  "/api/task/t1": { id: "t1", title: "Fix login", number: 7, projectId: "p1" },
  "/api/task/t2": {
    id: "t2",
    title: "Old work",
    number: 2,
    projectId: "p1",
    status: "archived",
  },
};

const text = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  isError,
});

function setup(
  run: (
    args: Record<string, unknown>,
    writeClient: { lastOutcome: InternalRequestOutcome | null },
  ) => Promise<CallToolResult>,
) {
  const writeClient: { lastOutcome: InternalRequestOutcome | null } = {
    lastOutcome: null,
  };
  const runSpy = vi.fn((args: Record<string, unknown>) =>
    run(args, writeClient),
  );
  const handle = (name: string, readOnly = false) =>
    ({ name, readOnly, run: runSpy }) as unknown as AssistantToolHandle;
  const tools = {
    lookup: (name: string) =>
      name === "get_task" ? handle(name, true) : handle(name),
  } as unknown as AssistantTools;
  const readClient: ToolClient = {
    async json<T>(path: string) {
      if (!(path in READS)) throw new Error(`${path}: Not found`);
      return READS[path] as T;
    },
  };
  const deps: ExecutionDeps = {
    tools,
    writeClient,
    readClient,
    workspace: { id: "ws", slug: "acme" },
  };
  return { deps, runSpy, writeClient };
}

const status = (code: number): InternalRequestOutcome => ({
  kind: "status",
  status: code,
});

describe("executeApproved", () => {
  it("runs the proposal and summarizes what it changed", async () => {
    const { deps, runSpy } = setup(async (_args, client) => {
      client.lastOutcome = status(200);
      return text({ id: "t1", title: "Fix login", number: 7, projectId: "p1" });
    });
    expect(
      await executeApproved(
        {
          toolName: "update_task_status",
          toolArgs: '{"taskId":"t1","status":"done"}',
          preview: null,
        },
        deps,
      ),
    ).toEqual({
      content: expect.stringContaining('"id":"t1"'),
      isError: false,
      resultSummary: {
        label: "Updated MOB-7 Fix login",
        href: "/acme/task/MOB-7",
      },
    });
    expect(runSpy).toHaveBeenCalledWith({ taskId: "t1", status: "done" });
  });

  it("reports the API's error as a failure", async () => {
    const { deps } = setup(async (_args, client) => {
      client.lastOutcome = status(403);
      return text({ error: "/api/task/p1: Forbidden" }, true);
    });
    expect(
      await executeApproved(
        {
          toolName: "create_task",
          toolArgs: '{"projectId":"p1"}',
          preview: null,
        },
        deps,
      ),
    ).toEqual({
      content: "/api/task/p1: Forbidden",
      isError: true,
      resultSummary: null,
    });
  });

  it("leaves the outcome unknown after a timeout, a lost connection or a gateway error", async () => {
    const outcomes: InternalRequestOutcome[] = [
      { kind: "timeout" },
      { kind: "network" },
      status(502),
      status(503),
      status(504),
    ];
    for (const outcome of outcomes) {
      const { deps } = setup(async (_args, client) => {
        client.lastOutcome = outcome;
        return text({ error: "Bad gateway" }, true);
      });
      expect(
        await executeApproved(
          { toolName: "create_task", toolArgs: "{}", preview: null },
          deps,
        ),
      ).toEqual({
        content: OUTCOME_UNKNOWN,
        isError: true,
        resultSummary: null,
      });
    }
  });

  it("writes nothing to a task archived since the proposal", async () => {
    for (const toolName of ["update_task", "update_task_status"]) {
      const { deps, runSpy } = setup(async () => text({}));
      expect(
        await executeApproved(
          {
            toolName,
            toolArgs: '{"taskId":"t2","status":"done"}',
            preview: null,
          },
          deps,
        ),
      ).toEqual({
        content: ARCHIVED_SINCE,
        isError: true,
        resultSummary: null,
      });
      expect(runSpy).not.toHaveBeenCalled();
    }
  });

  it("runs nothing when it may no longer write", async () => {
    const { deps, runSpy } = setup(async () => text({}));
    expect(
      await executeApproved(
        {
          toolName: "update_task_status",
          toolArgs: '{"taskId":"t1","status":"done"}',
          preview: null,
        },
        { ...deps, mayWrite: () => false },
      ),
    ).toBeNull();
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("forgets the previous request's outcome before running", async () => {
    const { deps, writeClient } = setup(async () =>
      text({ error: "Invalid arguments" }, true),
    );
    writeClient.lastOutcome = { kind: "timeout" };
    expect(
      await executeApproved(
        { toolName: "create_task", toolArgs: "{}", preview: null },
        deps,
      ),
    ).toMatchObject({ content: "Invalid arguments", isError: true });
  });

  it("writes nothing when previewed text changed since the proposal", async () => {
    const preview = (from: string | null): AssistantProposalPreview => ({
      target: "Mobile",
      targetKey: "projectId",
      fields: [{ key: "description", kind: "markdown", value: "New", from }],
      diff: null,
      nested: null,
    });
    const row = (from: string | null) => ({
      toolName: "update_project_details",
      toolArgs: '{"projectId":"p1","description":"New"}',
      preview: preview(from),
    });

    const changed = setup(async () => text({}));
    expect(await executeApproved(row("Older"), changed.deps)).toEqual({
      content: CHANGED_SINCE,
      isError: true,
      resultSummary: null,
    });
    expect(changed.runSpy).not.toHaveBeenCalled();

    const same = setup(async (_args, client) => {
      client.lastOutcome = status(200);
      return text({ id: "p1", name: "Mobile" });
    });
    expect(await executeApproved(row("Old"), same.deps)).toMatchObject({
      isError: false,
      resultSummary: {
        label: "Updated project Mobile",
        href: "/dashboard/workspace/ws/project/p1",
      },
    });
  });

  it("writes nothing when the guard can't read the current text", async () => {
    const { deps, runSpy } = setup(async () => text({}));
    expect(
      await executeApproved(
        {
          toolName: "update_project_details",
          toolArgs: '{"projectId":"gone","name":"x"}',
          preview: {
            target: null,
            targetKey: null,
            fields: [{ key: "name", kind: "text", value: "x", from: "y" }],
            diff: null,
            nested: null,
          },
        },
        deps,
      ),
    ).toMatchObject({ content: GUARD_UNREADABLE, isError: true });
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("refuses rows it can't run", async () => {
    const { deps, runSpy } = setup(async () => text({}));
    for (const row of [
      { toolName: "create_task", toolArgs: "not json", preview: null },
      { toolName: null, toolArgs: "{}", preview: null },
      { toolName: "get_task", toolArgs: "{}", preview: null },
    ])
      expect(await executeApproved(row, deps)).toMatchObject({
        content: NOT_RUNNABLE,
        isError: true,
      });
    expect(runSpy).not.toHaveBeenCalled();
  });
});
