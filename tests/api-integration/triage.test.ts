import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { handleMemberRemoved } from "../../apps/api/src/workspace-members/handle-member-removed";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

vi.mock("../../apps/api/src/notification-preferences/delivery", () => ({
  deliverNotification: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
});

type User = typeof schema.userTable.$inferSelect;

async function setup() {
  const [workspace] = await db
    .insert(schema.workspaceTable)
    .values({
      id: `workspace-${crypto.randomUUID()}`,
      name: "Triage",
      slug: `triage-${crypto.randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();
  const owner = await addWorkspaceMember(workspace!.id, "owner");
  const triager = await addWorkspaceMember(workspace!.id, "member");
  const reporter = await addWorkspaceMember(workspace!.id, "member");
  const { project, columns } = await createProjectFixture({
    workspaceId: workspace!.id,
  });
  return { workspace: workspace!, owner, triager, reporter, project, columns };
}

function as(user: User) {
  mockAuthenticatedSession(user as never);
  return projectAccessApi();
}

async function setMembers(owner: User, projectId: string, userIds: string[]) {
  const response = await as(owner)(`/triage/project/${projectId}/members`, {
    method: "PUT",
    body: { userIds },
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function create(
  user: User,
  projectId: string,
  body: Record<string, unknown> = {},
) {
  const response = await as(user)(`/task/${projectId}`, {
    method: "POST",
    body: { title: "Broken", description: "", type: "bug", ...body },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    id: string;
    status: string;
    createdBy: string | null;
  };
}

async function readTask(id: string) {
  return db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, id) });
}

async function notificationTypes(userId: string) {
  const rows = await db
    .select({ type: schema.notificationTable.type })
    .from(schema.notificationTable)
    .where(eq(schema.notificationTable.userId, userId));
  return rows.map((row) => row.type);
}

describe("triage members", () => {
  it("needs project:update to change and only takes members with access", async () => {
    const ctx = await setup();
    const path = `/triage/project/${ctx.project.id}/members`;

    expect(await (await as(ctx.reporter)(path)).json()).toEqual({
      userIds: [],
    });
    expect(
      (
        await as(ctx.reporter)(path, {
          method: "PUT",
          body: { userIds: [ctx.reporter.id] },
        })
      ).status,
    ).toBe(403);

    const outsider = await addWorkspaceMember(
      (
        await db
          .insert(schema.workspaceTable)
          .values({
            id: `workspace-${crypto.randomUUID()}`,
            name: "Other",
            slug: `other-${crypto.randomUUID()}`,
            createdAt: new Date(),
          })
          .returning()
      )[0]!.id,
    );
    expect(
      (
        await as(ctx.owner)(path, {
          method: "PUT",
          body: { userIds: [outsider.id] },
        })
      ).status,
    ).toBe(400);

    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    await restrictToProjects(ctx.workspace.id, ctx.reporter.id, [
      other.project.id,
    ]);
    expect(
      (
        await as(ctx.owner)(path, {
          method: "PUT",
          body: { userIds: [ctx.reporter.id] },
        })
      ).status,
    ).toBe(400);

    expect(
      await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]),
    ).toEqual({ userIds: [ctx.triager.id] });
    expect(await (await as(ctx.triager)(path)).json()).toEqual({
      userIds: [ctx.triager.id],
    });
    expect((await as(ctx.reporter)(path)).status).toBe(403);
  });

  it("drops a member who leaves the workspace or loses project access", async () => {
    const ctx = await setup();
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id, ctx.owner.id]);
    await setMembers(ctx.owner, other.project.id, [ctx.triager.id]);

    const lost = await as(ctx.owner)(
      `/workspace/${ctx.workspace.id}/members/${ctx.triager.id}/project-access`,
      {
        method: "PUT",
        body: { projectAccess: "selected", projectIds: [other.project.id] },
      },
    );
    expect(lost.status).toBe(200);
    const rows = () =>
      db
        .select({
          projectId: schema.projectTriageMemberTable.projectId,
          userId: schema.projectTriageMemberTable.userId,
        })
        .from(schema.projectTriageMemberTable)
        .where(eq(schema.projectTriageMemberTable.userId, ctx.triager.id));
    expect(await rows()).toEqual([
      { projectId: other.project.id, userId: ctx.triager.id },
    ]);

    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ctx.workspace.id),
          eq(schema.workspaceUserTable.userId, ctx.triager.id),
        ),
      );
    await handleMemberRemoved({
      workspaceId: ctx.workspace.id,
      userId: ctx.triager.id,
      userRole: "member",
    });
    expect(await rows()).toEqual([]);
  });
});

describe("routing new work", () => {
  it("sends work from outside the triage list to Triage, whatever status was asked", async () => {
    const ctx = await setup();

    const before = await create(ctx.reporter, ctx.project.id, {
      status: "in-progress",
    });
    expect(before.status).toBe("in-progress");

    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const reported = await create(ctx.reporter, ctx.project.id, {
      status: "in-progress",
    });
    expect(reported).toMatchObject({
      status: "triage",
      createdBy: ctx.reporter.id,
    });
    expect((await readTask(reported.id))?.columnId).toBeNull();

    const own = await create(ctx.triager, ctx.project.id);
    expect(own.status).toBe("to-do");

    const feature = await as(ctx.reporter)(`/task/${ctx.project.id}`, {
      method: "POST",
      body: { title: "Area", description: "", type: "feature" },
    });
    expect(((await feature.json()) as { status: null }).status).toBeNull();

    const direct = await as(ctx.triager)(`/task/${ctx.project.id}`, {
      method: "POST",
      body: { title: "x", description: "", status: "triage" },
    });
    expect(direct.status).toBe(400);
  });

  it("routes duplicates and JSON imports, and keeps triage off the board columns", async () => {
    const ctx = await setup();
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const source = await create(ctx.triager, ctx.project.id);

    const copy = await as(ctx.reporter)(`/task/duplicate/${source.id}`, {
      method: "POST",
      body: {},
    });
    expect(copy.status).toBe(200);
    const copied = (await copy.json()) as { id: string; status: string };
    expect(copied.status).toBe("triage");

    const imported = await as(ctx.reporter)(`/task/import/${ctx.project.id}`, {
      method: "POST",
      body: { tasks: [{ title: "From file", status: "done" }] },
    });
    expect(imported.status).toBe(200);
    const result = (await imported.json()) as {
      results: { tasks: { task: { status: string; createdBy: string } }[] };
    };
    expect(result.results.tasks[0]?.task).toMatchObject({
      status: "triage",
      createdBy: ctx.reporter.id,
    });

    const triageCopy = await as(ctx.triager)(`/task/duplicate/${copied.id}`, {
      method: "POST",
      body: {},
    });
    expect(((await triageCopy.json()) as { status: string }).status).toBe(
      "planned",
    );

    const board = (await (
      await as(ctx.reporter)(`/task/tasks/${ctx.project.id}`)
    ).json()) as {
      data: {
        triageTasks: { id: string; createdBy: string | null }[];
        plannedTasks: { id: string }[];
        columns: { tasks: { id: string }[] }[];
      };
    };
    expect(board.data.triageTasks.map((task) => task.id).sort()).toEqual(
      [
        copied.id,
        (await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.title, "From file"),
        }))!.id,
      ].sort(),
    );
    const elsewhere = [
      ...board.data.plannedTasks,
      ...board.data.columns.flatMap((column) => column.tasks),
    ].map((task) => task.id);
    for (const task of board.data.triageTasks)
      expect(elsewhere).not.toContain(task.id);
  });
});

describe("accept and decline", () => {
  it("lets only triage members decide, and moves accepted work to To Do", async () => {
    const ctx = await setup();
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const task = await create(ctx.reporter, ctx.project.id);

    expect(
      (
        await as(ctx.reporter)(`/triage/task/${task.id}/accept`, {
          method: "POST",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as(ctx.owner)(`/triage/task/${task.id}/accept`, {
          method: "POST",
        })
      ).status,
    ).toBe(403);

    const accepted = await as(ctx.triager)(`/triage/task/${task.id}/accept`, {
      method: "POST",
    });
    expect(accepted.status).toBe(200);
    expect(await readTask(task.id)).toMatchObject({
      status: "to-do",
      columnId: ctx.columns.todo.id,
    });

    expect(
      (
        await as(ctx.triager)(`/triage/task/${task.id}/accept`, {
          method: "POST",
        })
      ).status,
    ).toBe(409);

    await vi.waitFor(async () => {
      expect(await notificationTypes(ctx.triager.id)).toContain(
        "task_triage_new",
      );
      expect(await notificationTypes(ctx.reporter.id)).toContain(
        "task_triage_accepted",
      );
      const activity = await db
        .select({ type: schema.activityTable.type })
        .from(schema.activityTable)
        .where(eq(schema.activityTable.taskId, task.id));
      expect(activity.map((row) => row.type)).toContain("triage_accepted");
      expect(activity.map((row) => row.type)).not.toContain("status_changed");
    });
    expect(await notificationTypes(ctx.owner.id)).not.toContain(
      "task_triage_new",
    );
  });

  it("accepts into the first open column when the project has no To Do", async () => {
    const ctx = await setup();
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const task = await create(ctx.reporter, ctx.project.id);
    await db
      .update(schema.taskTable)
      .set({ columnId: null })
      .where(eq(schema.taskTable.columnId, ctx.columns.todo.id));
    await db
      .delete(schema.columnTable)
      .where(eq(schema.columnTable.id, ctx.columns.todo.id));

    await as(ctx.triager)(`/triage/task/${task.id}/accept`, { method: "POST" });
    expect(await readTask(task.id)).toMatchObject({
      status: "in-progress",
      columnId: ctx.columns.inProgress.id,
    });
    await vi.waitFor(async () =>
      expect(await notificationTypes(ctx.reporter.id)).toContain(
        "task_triage_accepted",
      ),
    );
  });

  it("archives declined work with the reason as a comment and tells the reporter", async () => {
    const ctx = await setup();
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const task = await create(ctx.reporter, ctx.project.id);

    const declined = await as(ctx.triager)(`/triage/task/${task.id}/decline`, {
      method: "POST",
      body: { reason: "Works as designed" },
    });
    expect(declined.status).toBe(200);
    expect((await readTask(task.id))?.status).toBe("archived");
    const comments = await db
      .select({
        content: schema.activityTable.content,
        userId: schema.activityTable.userId,
      })
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, task.id),
          eq(schema.activityTable.type, "comment"),
        ),
      );
    expect(comments).toEqual([
      { content: "Works as designed", userId: ctx.triager.id },
    ]);
    await vi.waitFor(async () => {
      const [row] = await db
        .select({ eventData: schema.notificationTable.eventData })
        .from(schema.notificationTable)
        .where(
          and(
            eq(schema.notificationTable.userId, ctx.reporter.id),
            eq(schema.notificationTable.type, "task_triage_declined"),
          ),
        );
      expect(row?.eventData).toMatchObject({ reason: "Works as designed" });
    });
  });

  it("lets project:update holders clear work once the list is empty", async () => {
    const ctx = await setup();
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const task = await create(ctx.reporter, ctx.project.id);
    await setMembers(ctx.owner, ctx.project.id, []);

    expect(
      (
        await as(ctx.reporter)(`/triage/task/${task.id}/decline`, {
          method: "POST",
          body: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as(ctx.owner)(`/triage/task/${task.id}/decline`, {
          method: "POST",
          body: {},
        })
      ).status,
    ).toBe(200);
    await vi.waitFor(async () =>
      expect(await notificationTypes(ctx.reporter.id)).toContain(
        "task_triage_declined",
      ),
    );
  });
});

describe("leaving triage", () => {
  it("refuses every other way out, and setting triage directly", async () => {
    const ctx = await setup();
    await setMembers(ctx.owner, ctx.project.id, [ctx.triager.id]);
    const task = await create(ctx.reporter, ctx.project.id);
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    const triager = as(ctx.triager);

    expect(
      (
        await triager(`/task/status/${task.id}`, {
          method: "PUT",
          body: { status: "done" },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await triager("/task/bulk", {
          method: "PATCH",
          body: {
            taskIds: [task.id],
            operation: "updateStatus",
            value: "archived",
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await triager(`/task/move/${task.id}`, {
          method: "PUT",
          body: { destinationProjectId: other.project.id },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await triager("/task/reorder", {
          method: "POST",
          body: {
            projectId: ctx.project.id,
            tasks: [{ id: task.id, position: 1, status: "to-do" }],
          },
        })
      ).status,
    ).toBe(409);
    expect((await readTask(task.id))?.status).toBe("triage");

    const todo = await create(ctx.triager, ctx.project.id);
    expect(
      (
        await triager(`/task/status/${todo.id}`, {
          method: "PUT",
          body: { status: "triage" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await triager(`/triage/task/${todo.id}/accept`, { method: "POST" }))
        .status,
    ).toBe(409);
  });
});
