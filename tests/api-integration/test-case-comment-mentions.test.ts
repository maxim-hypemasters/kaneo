import * as email from "@kaneo/email";
import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import "../../apps/api/src/notification";
import db, { schema } from "../../apps/api/src/database";
import getNotifications from "../../apps/api/src/notification/controllers/get-notifications";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import {
  addMember,
  createCommentFixture,
  mention,
} from "./helpers/test-case/comment-fixture";

vi.mock("@kaneo/email", async (original) => ({
  ...(await original<object>()),
  sendNotificationEmail: vi.fn(async () => undefined),
}));
vi.mock("../../apps/api/src/events", async (original) => {
  const events = await original<typeof import("../../apps/api/src/events")>();
  return {
    ...events,
    // Delivery assertions and the next test's TRUNCATE must wait for every
    // subscriber.
    publishEvent: (...args: Parameters<typeof events.publishEvent>) =>
      events.publishEvent(args[0], args[1], { waitForHandlers: true }),
  };
});

afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  vi.stubEnv("KANEO_CLIENT_URL", "https://kaneo.example");
  await resetTestDatabase();
  vi.clearAllMocks();
});

const notifications = () => db.select().from(schema.notificationTable);

describe("test case comment mentions", () => {
  it("notifies a mentioned teammate, who finds it in the workspace's inbox", async () => {
    const ctx = await createCommentFixture();
    const teammate = await addMember(ctx.author.workspace.id);
    mockAuthenticatedSession(ctx.author.user);
    const response = await ctx.request("POST", "/comments", {
      content: `${mention(teammate.id)} please retest`,
    });
    expect(response.status).toBe(200);

    expect(await notifications()).toMatchObject([
      {
        userId: teammate.id,
        type: "test_case_mention",
        resourceType: "test_case",
        resourceId: ctx.testCase.id,
        eventData: {
          testCaseTitle: "Checks out",
          mentionerName: ctx.author.user.name,
          projectId: ctx.project.id,
          workspaceId: ctx.author.workspace.id,
        },
      },
    ]);
    expect(
      await getNotifications(teammate.id, ctx.author.workspace.id),
    ).toHaveLength(1);
    const elsewhere = await createWorkspaceMember();
    expect(
      await getNotifications(teammate.id, elsewhere.workspace.id),
    ).toHaveLength(0);
  });

  it("skips the author, outsiders, unknown ids and members who can't read test cases", async () => {
    const ctx = await createCommentFixture();
    const outsider = await createWorkspaceMember();
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.author.workspace.id,
      role: "tasks-only",
      permission: JSON.stringify({ task: ["read"] }),
    });
    const blind = await addMember(ctx.author.workspace.id, "tasks-only");
    mockAuthenticatedSession(ctx.author.user);
    const content = [ctx.author.user.id, outsider.user.id, blind.id, "nobody"]
      .map(mention)
      .join(" ");
    expect((await ctx.request("POST", "/comments", { content })).status).toBe(
      200,
    );
    expect(await notifications()).toHaveLength(0);
  });

  it("respects the comments and mentions preference, and doesn't notify on edit", async () => {
    const ctx = await createCommentFixture();
    const muted = await addMember(ctx.author.workspace.id);
    const teammate = await addMember(ctx.author.workspace.id);
    await db
      .insert(schema.userNotificationPreferenceTable)
      .values({ userId: muted.id, taskCommentEnabled: false });
    mockAuthenticatedSession(ctx.author.user);
    const comment = (await (
      await ctx.request("POST", "/comments", {
        content: `${mention(muted.id)} look`,
      })
    ).json()) as { id: string };
    await ctx.request("PATCH", `/comments/${comment.id}`, {
      content: `${mention(teammate.id)} look`,
    });
    expect(await notifications()).toHaveLength(0);
  });

  it("hides the notification once the test case is deleted", async () => {
    const ctx = await createCommentFixture();
    const teammate = await addMember(ctx.author.workspace.id);
    mockAuthenticatedSession(ctx.author.user);
    await ctx.request("POST", "/comments", { content: mention(teammate.id) });
    await db
      .delete(schema.testCaseTable)
      .where(eq(schema.testCaseTable.id, ctx.testCase.id));
    expect(
      await getNotifications(teammate.id, ctx.author.workspace.id),
    ).toHaveLength(0);
  });

  it("emails a link that opens the test case", async () => {
    const ctx = await createCommentFixture();
    const teammate = await addMember(ctx.author.workspace.id);
    await db
      .insert(schema.userNotificationPreferenceTable)
      .values({ userId: teammate.id, emailEnabled: true });
    await db.insert(schema.userNotificationWorkspaceRuleTable).values({
      userId: teammate.id,
      workspaceId: ctx.author.workspace.id,
      isActive: true,
      emailEnabled: true,
      projectMode: "all",
    });
    const send = vi
      .spyOn(email, "sendNotificationEmail")
      .mockResolvedValue(undefined);
    mockAuthenticatedSession(ctx.author.user);
    await ctx.request("POST", "/comments", { content: mention(teammate.id) });

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0]).toBe(teammate.email);
    expect(send.mock.calls[0]![2]).toMatchObject({
      title: `${ctx.author.user.name} mentioned you`,
      message: "You were mentioned in the test case Checks out.",
      actionUrl: `https://kaneo.example/dashboard/workspace/${ctx.author.workspace.id}/project/${ctx.project.id}/test-cases?testCaseId=${ctx.testCase.id}`,
    });
  });
});
