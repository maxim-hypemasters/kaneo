import { randomUUID } from "node:crypto";
import { expect } from "vite-plus/test";
import db, { schema } from "../../../apps/api/src/database";
import { createApp } from "../../../apps/api/src/index";
import { mockSessionsByToken } from "./auth";
import { readErrorBody } from "./error-body";
import { createProjectFixture, createWorkspaceMember } from "./fixtures";

type User = typeof schema.userTable.$inferSelect;

export type Claim = {
  run: { id: string; kind: string; attempt: number };
  context: {
    task: { ticketId: string; title: string; description: string };
    clarifications: Array<{ question: string; answer: string }>;
    relatedTasks: Array<{ ticketId: string; title: string; relation: string }>;
    project: { repository: string | null; instructions: string };
    branchName: string;
    resultSchema: Record<string, unknown> | null;
  };
};

async function joinWorkspace(workspaceId: string, name: string, role: string) {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: `user-${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user!.id,
    role,
    joinedAt: new Date(),
  });
  return user!;
}

export const READY_ASSESSMENT = {
  score: 90,
  summary: "Clear bug with repro steps.",
  checklist: [{ key: "goal", label: "Goal", status: "met" }],
  questions: [],
  suggestions: [],
};

/** A workspace with an admin, a member and a viewer, a project and a bug. */
export async function setupAgentWorkspace() {
  const { user: admin, workspace } = await createWorkspaceMember({
    role: "admin",
    userName: "Ada Admin",
  });
  const member = await joinWorkspace(workspace.id, "Mo Member", "member");
  const viewer = await joinWorkspace(workspace.id, "Vi Viewer", "viewer");
  mockSessionsByToken([admin, member, viewer]);
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    slug: "hub",
  });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: project.id,
      title: "Login fails on Firefox",
      description: "Steps: open /login and submit.",
      type: "bug",
      number: 7,
    })
    .returning();
  const { app } = createApp();

  const call = (user: User, method: string, path: string, body?: unknown) =>
    app.request(`/api${path}`, {
      method,
      headers: {
        authorization: `Bearer token-${user.id}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const runnerCall = (
    token: string,
    method: string,
    path: string,
    body?: unknown,
    attempt?: number | string,
  ) =>
    app.request(`/api/agent-runner${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(attempt === undefined
          ? {}
          : { "x-kaneo-run-attempt": String(attempt) }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  // A request about a claimed run, sent as the attempt that claimed it.
  const runCall = (
    token: string,
    claimed: Claim,
    action: "heartbeat" | "events" | "assessment" | "ship-result" | "fail",
    body?: unknown,
  ) =>
    runnerCall(
      token,
      "POST",
      `/runs/${claimed.run.id}/${action}`,
      body,
      claimed.run.attempt,
    );

  const enable = async (overrides: Record<string, unknown> = {}) => {
    const response = await call(
      admin,
      "PUT",
      `/agent/project/${project.id}/settings`,
      {
        enabled: true,
        autoAssess: false,
        repository: "acme/app",
        baseBranch: "main",
        instructions: "Run pnpm test.",
        readyThreshold: 80,
        ...overrides,
      },
    );
    expect(response.status).toBe(200);
  };
  const createRunnerToken = async (forWorkspace = workspace.id, as = admin) => {
    const response = await call(
      as,
      "POST",
      `/agent/workspace/${forWorkspace}/runner/token`,
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { token: string }).token;
  };
  const getAgent = async (as: User = member) => {
    const response = await call(as, "GET", `/agent/task/${task!.id}`);
    expect(response.status).toBe(200);
    return (await response.json()) as {
      enabled: boolean;
      stale: boolean;
      assessing: boolean;
      assessment: null | {
        score: number;
        verdict: string;
        questions: Array<{ id: string; text: string; blocking: boolean }>;
        suggestions: Array<{ id: string; title: string; markdown: string }>;
      };
      clarifications: Array<{ question: string; answer: string }>;
      runner: { configured: boolean; online: boolean };
      ship: {
        canShip: boolean;
        blockers: string[];
        branchName: string;
        activeRun: null | {
          id: string;
          status: string;
          cancelRequested: boolean;
        };
        lastRun: null | {
          id: string;
          status: string;
          result: unknown;
          errorCode: string | null;
        };
        events: Array<{ message: string }>;
      };
    };
  };
  const claim = async (
    token: string,
    kinds: string[] = ["assess", "ship"],
  ): Promise<Claim | null> => {
    const response = await runnerCall(token, "POST", "/claim", { kinds });
    if (response.status === 204) return null;
    expect(response.status).toBe(200);
    return (await response.json()) as Claim;
  };
  const assess = async (token: string, result: unknown) => {
    const claimed = await claim(token, ["assess"]);
    expect(claimed?.run.kind).toBe("assess");
    const response = await runCall(token, claimed!, "assessment", result);
    expect(response.status).toBe(200);
  };

  return {
    admin,
    member,
    viewer,
    workspace,
    project,
    task: task!,
    app,
    call,
    runnerCall,
    runCall,
    enable,
    createRunnerToken,
    getAgent,
    claim,
    assess,
  };
}

export async function expectError(
  response: Response,
  status: number,
  code?: string,
) {
  expect(response.status).toBe(status);
  if (code) expect(await readErrorBody(response)).toMatchObject({ code });
}
