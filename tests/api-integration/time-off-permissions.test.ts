import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { migrateTimeOffPermissions } from "../../apps/api/src/migrations/time-off-permissions";
import { createInstanceAdmin } from "./helpers/admin/create-instance-admin";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import {
  addDays,
  insertTimeOff,
  mondayInWeeks,
  setMemberRole,
  setWorkspaceRolePermissions,
} from "./helpers/time-off";
import { currentYear } from "./helpers/time-off-days";
import {
  type Caller,
  callerFor,
  createTimeOffTeam,
  type TimeOffTeam,
} from "./helpers/time-off-team";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(resetTestDatabase);

type Role = "viewer" | "member" | "admin" | "owner";
type Expected = number | number[];

const ANYONE = { viewer: 200, member: 200, admin: 200, owner: 200 };
const REQUESTERS = { viewer: 403, member: 200, admin: 200, owner: 200 };
const APPROVERS = { viewer: 403, member: 403, admin: 200, owner: 200 };
// A member may not learn that someone else's request exists. A viewer has
// neither create nor approve, so the permission check may answer first.
const HIDDEN_FROM_NON_APPROVERS = {
  viewer: [403, 404],
  member: 404,
  admin: 200,
  owner: 200,
};

function week(weeks: number) {
  const startDate = mondayInWeeks(weeks);
  return { startDate, endDate: addDays(startDate, 4) };
}

function expectStatus(response: Response, expected: Expected, label: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  expect(allowed, `${label}: got ${response.status}`).toContain(
    response.status,
  );
}

// A pending holiday calendar request written directly. A member has at most
// one pending, so an earlier one still pending is cancelled first.
async function pendingCalendarRequest(workspaceId: string, userId: string) {
  const owned = and(
    eq(schema.timeOffHolidayCalendarRequestTable.workspaceId, workspaceId),
    eq(schema.timeOffHolidayCalendarRequestTable.userId, userId),
  );
  await db
    .update(schema.timeOffHolidayCalendarRequestTable)
    .set({ status: "cancelled" })
    .where(
      and(
        owned,
        eq(schema.timeOffHolidayCalendarRequestTable.status, "pending"),
      ),
    );
  const [row] = await db
    .insert(schema.timeOffHolidayCalendarRequestTable)
    .values({ workspaceId, userId, country: "FR" })
    .returning();
  if (!row) throw new Error("Failed to insert a calendar request");
  return row;
}

// Rows for `subject`, and for `caller` itself, written directly so every
// check below has its own untouched request.
async function seedRequests(team: TimeOffTeam, callerId: string) {
  const ws = team.workspaceId;
  const subject = team.colleague.id;
  const pending = (weeks: number, userId = subject) =>
    insertTimeOff({
      workspaceId: ws,
      userId,
      ...week(weeks),
      createdBy: team.owner.id,
    });
  return {
    read: await pending(2),
    edit: await pending(4),
    cancel: await pending(6),
    approve: await pending(8),
    decline: await pending(10),
    ownEdit: await pending(12, callerId),
    ownCancel: await pending(14, callerId),
    ownApprove: await pending(16, callerId),
  };
}

async function runMatrix(
  team: TimeOffTeam,
  caller: Caller,
  callerId: string,
  expected: (label: string) => Expected,
) {
  const ws = team.workspaceId;
  const subject = team.colleague.id;
  const rows = await seedRequests(team, callerId);
  const year = currentYear();
  const calendarRequestPath = (request: { id: string }, action: string) =>
    `/workspace/${ws}/holiday-calendar-requests/${request.id}/${action}`;
  const checks: [string, () => Promise<Response>][] = [
    [
      "team calendar",
      () => caller(`/workspace/${ws}?from=${year}-01-01&to=${year}-12-31`),
    ],
    ["own requests", () => caller(`/workspace/${ws}/requests`)],
    ["own balance", () => caller(`/workspace/${ws}/balance`)],
    ["read own request", () => caller(`/${rows.ownEdit.id}`)],
    [
      "request own time off",
      () =>
        caller(`/workspace/${ws}`, "POST", { type: "vacation", ...week(20) }),
    ],
    [
      "edit own request",
      () => caller(`/${rows.ownEdit.id}`, "PATCH", { note: "mine" }),
    ],
    [
      "cancel own request",
      () => caller(`/${rows.ownCancel.id}/cancel`, "POST"),
    ],
    [
      "approve own request",
      () => caller(`/${rows.ownApprove.id}/approve`, "POST", { version: 0 }),
    ],
    [
      "member requests",
      () => caller(`/workspace/${ws}/requests?userId=${subject}`),
    ],
    [
      "member balance",
      () => caller(`/workspace/${ws}/balance?userId=${subject}`),
    ],
    ["pending queue", () => caller(`/workspace/${ws}/pending`)],
    ["all balances", () => caller(`/workspace/${ws}/balances`)],
    ["default allowances", () => caller(`/workspace/${ws}/allowance`)],
    [
      "default allowance",
      () => caller(`/workspace/${ws}/allowance/vacation`, "PUT", { days: 20 }),
    ],
    [
      "member allowance",
      () =>
        caller(`/workspace/${ws}/allowance/vacation/${subject}`, "PUT", {
          days: 10,
        }),
    ],
    [
      "clear member allowance",
      () => caller(`/workspace/${ws}/allowance/vacation/${subject}`, "DELETE"),
    ],
    [
      "record for a member",
      () =>
        caller(`/workspace/${ws}`, "POST", {
          userId: subject,
          type: "sick",
          ...week(22),
        }),
    ],
    ["read member request", () => caller(`/${rows.read.id}`)],
    [
      "edit member request",
      () => caller(`/${rows.edit.id}`, "PATCH", { note: "theirs" }),
    ],
    [
      "cancel member request",
      () => caller(`/${rows.cancel.id}/cancel`, "POST"),
    ],
    [
      "approve member request",
      () => caller(`/${rows.approve.id}/approve`, "POST", { version: 0 }),
    ],
    [
      "decline member request",
      () => caller(`/${rows.decline.id}/decline`, "POST", { version: 0 }),
    ],
    [
      "calendar requests",
      () => caller(`/workspace/${ws}/holiday-calendar-requests`),
    ],
    [
      "approve member calendar request",
      async () =>
        caller(
          calendarRequestPath(
            await pendingCalendarRequest(ws, subject),
            "approve",
          ),
          "POST",
          { version: 0 },
        ),
    ],
    [
      "decline member calendar request",
      async () =>
        caller(
          calendarRequestPath(
            await pendingCalendarRequest(ws, subject),
            "decline",
          ),
          "POST",
          { version: 0 },
        ),
    ],
    [
      "cancel member calendar request",
      async () =>
        caller(
          calendarRequestPath(
            await pendingCalendarRequest(ws, subject),
            "cancel",
          ),
          "POST",
        ),
    ],
    [
      "cancel own calendar request",
      async () =>
        caller(
          calendarRequestPath(
            await pendingCalendarRequest(ws, callerId),
            "cancel",
          ),
          "POST",
        ),
    ],
    ["time off settings", () => caller(`/workspace/${ws}/settings`)],
    [
      "set time off settings",
      () =>
        caller(`/workspace/${ws}/settings`, "PUT", {
          holidayCalendarDeadline: null,
        }),
    ],
  ];
  for (const [label, run] of checks) {
    expectStatus(await run(), expected(label), label);
  }
}

const ROLE_MATRIX: Record<string, Record<Role, Expected>> = {
  "team calendar": ANYONE,
  "own requests": ANYONE,
  "own balance": ANYONE,
  "read own request": ANYONE,
  "request own time off": REQUESTERS,
  "edit own request": REQUESTERS,
  "cancel own request": REQUESTERS,
  "approve own request": APPROVERS,
  "member requests": APPROVERS,
  "member balance": APPROVERS,
  "pending queue": APPROVERS,
  "all balances": APPROVERS,
  "default allowances": APPROVERS,
  "default allowance": APPROVERS,
  "member allowance": APPROVERS,
  "clear member allowance": APPROVERS,
  "record for a member": APPROVERS,
  "read member request": { viewer: 404, member: 404, admin: 200, owner: 200 },
  "edit member request": HIDDEN_FROM_NON_APPROVERS,
  "cancel member request": HIDDEN_FROM_NON_APPROVERS,
  "approve member request": APPROVERS,
  "decline member request": APPROVERS,
  "calendar requests": APPROVERS,
  "approve member calendar request": APPROVERS,
  "decline member calendar request": APPROVERS,
  "cancel member calendar request": APPROVERS,
  "cancel own calendar request": REQUESTERS,
  "time off settings": APPROVERS,
  "set time off settings": APPROVERS,
};

describe("time off role matrix", () => {
  it.each(["viewer", "member", "admin", "owner"] as const)(
    "gives the built-in %s role exactly its time off actions",
    async (role) => {
      const team = await createTimeOffTeam();
      const person = {
        viewer: team.viewer,
        member: team.member,
        admin: team.admin,
        owner: team.owner,
      }[role];
      await runMatrix(team, team.as(person), person.id, (label) => {
        const expected = ROLE_MATRIX[label]?.[role];
        if (expected === undefined)
          throw new Error(`No expectation for ${label}`);
        return expected;
      });
    },
  );
});

describe("custom time off roles", () => {
  async function customTeam(permission: Record<string, string[]>) {
    const team = await createTimeOffTeam();
    await setWorkspaceRolePermissions(team.workspaceId, "custom", permission);
    const person = await addWorkspaceMember(team.workspaceId, "custom");
    return { team, person, caller: team.as(person) };
  }

  it("lets a role with only time_off:create use its own data but not the team calendar", async () => {
    const { team, person, caller } = await customTeam({
      workspace: ["read"],
      time_off: ["create"],
    });
    await runMatrix(
      team,
      caller,
      person.id,
      (label) =>
        ({
          "team calendar": 403,
          "own requests": 200,
          "own balance": 200,
          "read own request": 200,
          "request own time off": 200,
          "edit own request": 200,
          "cancel own request": 200,
          "approve own request": 403,
          "read member request": 404,
          "edit member request": 404,
          "cancel member request": 404,
          "cancel own calendar request": 200,
        })[label] ?? 403,
    );
  });

  it("lets a role with read and approve but no create decide, record for others and see balances", async () => {
    const { team, person, caller } = await customTeam({
      workspace: ["read"],
      time_off: ["read", "approve"],
    });
    await runMatrix(
      team,
      caller,
      person.id,
      (label) =>
        ({
          "request own time off": 403,
        })[label] ?? 200,
    );
  });

  it("refuses every time off route to a role without time_off", async () => {
    const { team, caller } = await customTeam({
      workspace: ["read"],
      task: ["create", "read", "update"],
    });
    const ws = team.workspaceId;
    const year = currentYear();
    for (const [path, method, body] of [
      [`/workspace/${ws}?from=${year}-01-01&to=${year}-01-31`, "GET"],
      [`/workspace/${ws}/requests`, "GET"],
      [`/workspace/${ws}/balance`, "GET"],
      [`/workspace/${ws}/pending`, "GET"],
      [`/workspace/${ws}/balances`, "GET"],
      [`/workspace/${ws}`, "POST", { type: "vacation", ...week(2) }],
      [`/workspace/${ws}/allowance/vacation`, "PUT", { days: 3 }],
      [`/workspace/${ws}/holiday-calendar-requests`, "GET"],
      [`/workspace/${ws}/settings`, "GET"],
    ] as const) {
      expect(
        (await caller(path, method, body)).status,
        `${method} ${path}`,
      ).toBe(403);
    }
  });

  it("follows a built-in role's stored permissions over the compiled defaults", async () => {
    const team = await createTimeOffTeam();
    await setWorkspaceRolePermissions(team.workspaceId, "member", {
      workspace: ["read"],
      task: ["read"],
    });
    const member = team.as(team.member);
    expect(
      (
        await member(`/workspace/${team.workspaceId}`, "POST", {
          type: "vacation",
          ...week(2),
        })
      ).status,
    ).toBe(403);

    await setMemberRole(team.workspaceId, team.colleague.id, "admin");
    expect(
      (await team.as(team.colleague)(`/workspace/${team.workspaceId}/pending`))
        .status,
    ).toBe(200);
  });
});

describe("time off with scoped API keys", () => {
  async function keyFor(
    userId: string,
    permissions?: Record<string, string[]>,
  ) {
    const { key } = await auth.api.createApiKey({
      body: { userId, name: "Time off scope test", permissions },
    });
    return key;
  }

  it("refuses an owner's key that lacks time_off", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const key = await keyFor(team.owner.id, {
      workspace: ["read"],
      task: ["create", "read", "update"],
      member: ["update"],
    });
    const caller = callerFor(team.app, null, { "x-api-key": key });
    const year = currentYear();
    for (const [path, method, body] of [
      [`/workspace/${ws}?from=${year}-01-01&to=${year}-01-31`, "GET"],
      [`/workspace/${ws}/requests`, "GET"],
      [`/workspace/${ws}/balance`, "GET"],
      [`/workspace/${ws}/pending`, "GET"],
      [`/workspace/${ws}/balances`, "GET"],
      [`/workspace/${ws}`, "POST", { type: "vacation", ...week(2) }],
      [`/workspace/${ws}/allowance/vacation`, "PUT", { days: 3 }],
      [`/workspace/${ws}/holiday-calendar-requests`, "GET"],
      [`/workspace/${ws}/settings`, "GET"],
    ] as const) {
      expect(
        (await caller(path, method, body)).status,
        `${method} ${path}`,
      ).toBe(403);
    }
    expect(await db.select().from(schema.timeOffTable)).toHaveLength(0);
  });

  it("limits an owner's key to the time_off actions it names", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const pending = await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...week(3),
    });
    const readKey = callerFor(team.app, null, {
      "x-api-key": await keyFor(team.owner.id, { time_off: ["read"] }),
    });
    const year = currentYear();
    expect(
      (await readKey(`/workspace/${ws}?from=${year}-01-01&to=${year}-12-31`))
        .status,
    ).toBe(200);
    expect((await readKey(`/workspace/${ws}/pending`)).status).toBe(403);
    expect(
      (await readKey(`/${pending.id}/approve`, "POST", { version: 0 })).status,
    ).toBe(403);
    expect(
      (
        await readKey(`/workspace/${ws}`, "POST", {
          type: "vacation",
          ...week(2),
        })
      ).status,
    ).toBe(403);

    const approveKey = callerFor(team.app, null, {
      "x-api-key": await keyFor(team.owner.id, {
        time_off: ["read", "approve"],
      }),
    });
    expect((await approveKey(`/workspace/${ws}/pending`)).status).toBe(200);
    expect(
      (await approveKey(`/${pending.id}/approve`, "POST", { version: 0 }))
        .status,
    ).toBe(200);
  });

  it("never lets a key exceed its user's role", async () => {
    const team = await createTimeOffTeam();
    const key = callerFor(team.app, null, {
      "x-api-key": await keyFor(team.member.id, {
        time_off: ["create", "read", "approve"],
      }),
    });
    expect((await key(`/workspace/${team.workspaceId}/pending`)).status).toBe(
      403,
    );
    expect(
      (
        await key(`/workspace/${team.workspaceId}`, "POST", {
          type: "vacation",
          ...week(2),
        })
      ).status,
    ).toBe(200);
  });
});

describe("instance admins outside the workspace", () => {
  it("get only the redacted calendar and 403 on approver routes", async () => {
    const team = await createTimeOffTeam();
    const ws = team.workspaceId;
    const approvedRange = week(2);
    const approved = await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...approvedRange,
      status: "approved",
      type: "sick",
      note: "surgery",
    });
    const pending = await insertTimeOff({
      workspaceId: ws,
      userId: team.member.id,
      ...week(4),
      type: "public_holiday",
      note: "dentist",
    });
    const instanceAdmin = await createInstanceAdmin();
    const caller = team.as(instanceAdmin);

    const year = currentYear();
    const calendar = await caller(
      `/workspace/${ws}?from=${addDays(approvedRange.startDate, -1)}&to=${addDays(approvedRange.startDate, 60)}`,
    );
    expect(calendar.status).toBe(200);
    const text = await calendar.text();
    expect(text).not.toMatch(
      /surgery|dentist|sick|public_holiday|approved|pending/,
    );
    expect(JSON.parse(text).entries).toEqual([
      { id: approved.id, userId: team.member.id, ...approvedRange },
    ]);

    for (const [label, response] of [
      ["pending queue", await caller(`/workspace/${ws}/pending`)],
      ["all balances", await caller(`/workspace/${ws}/balances?year=${year}`)],
      ["default allowances", await caller(`/workspace/${ws}/allowance`)],
      [
        "member requests",
        await caller(`/workspace/${ws}/requests?userId=${team.member.id}`),
      ],
      [
        "member balance",
        await caller(`/workspace/${ws}/balance?userId=${team.member.id}`),
      ],
      [
        "default allowance",
        await caller(`/workspace/${ws}/allowance/vacation`, "PUT", { days: 1 }),
      ],
      [
        "member allowance",
        await caller(
          `/workspace/${ws}/allowance/vacation/${team.member.id}`,
          "PUT",
          {
            days: 1,
          },
        ),
      ],
      [
        "clear member allowance",
        await caller(
          `/workspace/${ws}/allowance/vacation/${team.member.id}`,
          "DELETE",
        ),
      ],
      [
        "approve",
        await caller(`/${pending.id}/approve`, "POST", { version: 0 }),
      ],
      [
        "decline",
        await caller(`/${pending.id}/decline`, "POST", { version: 0 }),
      ],
      [
        "record for a member",
        await caller(`/workspace/${ws}`, "POST", {
          userId: team.member.id,
          type: "vacation",
          ...week(6),
        }),
      ],
    ] as const) {
      expect(response.status, label).toBe(403);
      expect(await response.text(), label).not.toMatch(/surgery|dentist/);
    }

    const hidden = await caller(`/${pending.id}`);
    const unknown = await caller("/no-such-time-off");
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual(await unknown.json());
    expect((await caller(`/${approved.id}`)).status).toBe(404);

    // Not a member, so not a valid target for their own request either.
    const own = await caller(`/workspace/${ws}`, "POST", {
      type: "vacation",
      ...week(8),
    });
    expect([403, 404]).toContain(own.status);

    const rows = await db.select().from(schema.timeOffTable);
    expect(rows.map((row) => [row.id, row.status, row.note]).sort()).toEqual(
      [
        [approved.id, "approved", "surgery"],
        [pending.id, "pending", "dentist"],
      ].sort(),
    );
    const [policy] = await db
      .select()
      .from(schema.timeOffPolicyTable)
      .where(eq(schema.timeOffPolicyTable.workspaceId, ws));
    expect(policy).toBeUndefined();
  });
});

describe("migrateTimeOffPermissions", () => {
  it("grants stored roles what their permissions imply, once, and leaves API keys byte-identical", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const roles = await db
      .insert(schema.workspaceRoleTable)
      .values([
        {
          workspaceId: workspace.id,
          role: "member",
          permission: JSON.stringify({
            workspace: ["read"],
            task: ["create", "read", "update"],
          }),
        },
        {
          workspaceId: workspace.id,
          role: "viewer",
          permission: JSON.stringify({ workspace: ["read"], task: ["read"] }),
        },
        {
          workspaceId: workspace.id,
          role: "admin",
          permission: JSON.stringify({
            workspace: ["read", "update"],
            bug: ["read", "update"],
            member: ["read", "update"],
          }),
        },
        {
          workspaceId: workspace.id,
          role: "decided",
          permission: JSON.stringify({ workspace: ["read"], time_off: [] }),
        },
        {
          workspaceId: workspace.id,
          role: "reporter",
          permission: JSON.stringify({ task: ["read"] }),
        },
      ])
      .returning();
    const byRole = new Map(roles.map((row) => [row.role, row]));

    await auth.api.createApiKey({
      body: {
        userId: user.id,
        name: "Scoped",
        permissions: {
          workspace: ["read"],
          task: ["read", "update"],
          member: ["update"],
        },
      },
    });
    await auth.api.createApiKey({
      body: { userId: user.id, name: "Unscoped" },
    });
    const keysBefore = await db.select().from(schema.apikeyTable);

    await migrateTimeOffPermissions();
    const afterFirst = await db.select().from(schema.workspaceRoleTable);
    await migrateTimeOffPermissions();
    // Even without the completion row, a role that has time_off is skipped.
    await db
      .delete(schema.dataMigrationTable)
      .where(eq(schema.dataMigrationTable.id, "time-off-permissions-v1"));
    await migrateTimeOffPermissions();

    const permission = async (role: string) => {
      const [row] = await db
        .select({ permission: schema.workspaceRoleTable.permission })
        .from(schema.workspaceRoleTable)
        .where(eq(schema.workspaceRoleTable.id, byRole.get(role)!.id));
      return JSON.parse(row!.permission) as Record<string, string[]>;
    };
    expect((await permission("member")).time_off?.slice().sort()).toEqual([
      "create",
      "read",
    ]);
    expect((await permission("viewer")).time_off).toEqual(["read"]);
    expect((await permission("admin")).time_off?.slice().sort()).toEqual([
      "approve",
      "create",
      "read",
    ]);
    expect(await permission("decided")).toEqual({
      workspace: ["read"],
      time_off: [],
    });
    expect(await permission("reporter")).toEqual({ task: ["read"] });
    expect(await permission("member")).toMatchObject({
      workspace: ["read"],
      task: ["create", "read", "update"],
    });

    const afterAll = await db.select().from(schema.workspaceRoleTable);
    const permissionsById = (rows: typeof afterAll) =>
      Object.fromEntries(rows.map((row) => [row.id, row.permission]));
    expect(permissionsById(afterAll)).toEqual(permissionsById(afterFirst));

    const keysAfter = await db.select().from(schema.apikeyTable);
    expect(keysAfter.map((key) => [key.id, key.permissions]).sort()).toEqual(
      keysBefore.map((key) => [key.id, key.permissions]).sort(),
    );
    expect(
      keysAfter.find((key) => key.name === "Scoped")?.permissions,
    ).not.toContain("time_off");
    expect(
      await db
        .select()
        .from(schema.dataMigrationTable)
        .where(eq(schema.dataMigrationTable.id, "time-off-permissions-v1")),
    ).toHaveLength(1);
  });
});
