import { eq } from "drizzle-orm";
import { vi } from "vite-plus/test";
import { auth } from "../../../apps/api/src/auth";
import db, { schema } from "../../../apps/api/src/database";
import { createApp } from "../../../apps/api/src/index";
import { createWorkspaceMember } from "./fixtures";
import { addWorkspaceMember } from "./project-access/add-workspace-member";

type App = ReturnType<typeof createApp>["app"];

const USER_HEADER = "x-test-user";

// Resolves the session from a test header instead of one global user, so
// parallel requests can act as different people.
export function mockSessionsByHeader() {
  const resolve = async ({ headers }: { headers: Headers }) => {
    const userId = headers.get(USER_HEADER);
    if (!userId) return null;
    const [user] = await db
      .select()
      .from(schema.userTable)
      .where(eq(schema.userTable.id, userId));
    if (!user) return null;
    const now = new Date();
    return {
      session: {
        id: `session-${userId}`,
        token: `token-${userId}`,
        userId,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
        ipAddress: null,
        userAgent: null,
      },
      user,
    };
  };
  return vi.spyOn(auth.api, "getSession").mockImplementation(resolve as never);
}

export type Caller = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<Response>;

// Calls `/api${prefix}${path}` as `userId`, or with `headers` alone (an API
// key) when userId is null.
export function callerFor(
  app: App,
  userId: string | null,
  headers: Record<string, string> = {},
  prefix = "/time-off",
): Caller {
  return async (path: string, method = "GET", body?: unknown) =>
    app.request(`/api${prefix}${path}`, {
      method,
      headers: {
        ...(userId ? { [USER_HEADER]: userId } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

// A workspace with one person in each built-in role, plus a second member.
export async function createTimeOffTeam() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Owner",
  });
  const admin = await addWorkspaceMember(workspace.id, "admin");
  const member = await addWorkspaceMember(workspace.id, "member");
  const colleague = await addWorkspaceMember(workspace.id, "member");
  const viewer = await addWorkspaceMember(workspace.id, "viewer");
  mockSessionsByHeader();
  const app = createApp().app;
  return {
    app,
    workspaceId: workspace.id,
    owner,
    admin,
    member,
    colleague,
    viewer,
    as: (user: { id: string }) => callerFor(app, user.id),
  };
}

export type TimeOffTeam = Awaited<ReturnType<typeof createTimeOffTeam>>;
