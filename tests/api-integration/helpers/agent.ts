import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
    planning: unknown;
  };
};

// A suggestion as getTaskAgent returns it; tests read the kind's fields.
export type AgentSuggestionView = { id: string; kind: string } & Record<
  string,
  unknown
>;

type AgentRun = {
  id: string;
  kind: string;
  status: string;
  cancelRequested: boolean;
  result: unknown;
  errorCode: string | null;
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
  questions: [],
  suggestions: [],
};

/**
 * Candidates for field suggestions: a feature with a milestone and an
 * upcoming release. The task loses its priority, so every field is empty.
 */
export async function addPlanningCandidates(projectId: string, taskId: string) {
  const [feature] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: "Sign-in",
      type: "feature",
      status: null,
      columnId: null,
      priority: null,
    })
    .returning();
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature!.id, title: "Beta" })
    .returning();
  const year = new Date().getUTCFullYear() + 1;
  const [release] = await db
    .insert(schema.releaseTable)
    .values({
      projectId,
      name: "Spring",
      startDate: `${year}-03-01`,
      codeFreezeDate: `${year}-03-20`,
      submissionDate: `${year}-03-31`,
    })
    .returning();
  await db
    .update(schema.taskTable)
    .set({ priority: "no-priority" })
    .where(eq(schema.taskTable.id, taskId));
  return { feature: feature!, milestone: milestone!, release: release! };
}

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
        suggestions: AgentSuggestionView[];
      };
      clarifications: Array<{ question: string; answer: string }>;
      runner: { configured: boolean; online: boolean };
      workflow: {
        todoStatus: string | null;
        inProgress: { slug: string; name: string } | null;
      };
      start: { canStart: boolean; blockers: string[]; pullRequest: string };
      ship: {
        canShip: boolean;
        blockers: string[];
        branchName: string;
        activeRun: null | AgentRun;
        lastRun: null | AgentRun;
        events: Array<{ message: string }>;
      };
    };
  };
  const taskStatus = async () =>
    (
      await db
        .select({ status: schema.taskTable.status })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, task!.id))
    )[0]!.status;
  const setTaskStatus = (status: string) =>
    db
      .update(schema.taskTable)
      .set({ status })
      .where(eq(schema.taskTable.id, task!.id));
  const claim = async (
    token: string,
    kinds: string[] = ["assess", "ship"],
    canPush?: boolean,
  ): Promise<Claim | null> => {
    const response = await runnerCall(token, "POST", "/claim", {
      kinds,
      ...(canPush === undefined ? {} : { canPush }),
    });
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
    taskStatus,
    setTaskStatus,
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
