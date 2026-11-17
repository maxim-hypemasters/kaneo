import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { handleMemberRemoved } from "../../apps/api/src/workspace-members/handle-member-removed";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { addDays, mondayInWeeks, timeOffClient } from "./helpers/time-off";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(resetTestDatabase);

describe("time off smoke", () => {
  it("creates, approves and shows other members only who and when", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const ws = owner.workspace.id;
    const requester = await addWorkspaceMember(ws, "member");
    const colleague = await addWorkspaceMember(ws, "member");
    const request = timeOffClient(createApp().app);
    const startDate = mondayInWeeks(2);
    const endDate = addDays(startDate, 4);

    mockAuthenticatedSession(requester);
    const created = await request(`/workspace/${ws}`, "POST", {
      type: "sick",
      startDate,
      endDate,
      note: "  surgery  ",
    });
    expect(created.status).toBe(200);
    const { request: pending, balances } = await created.json();
    expect(pending).toMatchObject({
      workspaceId: ws,
      userId: requester.id,
      status: "pending",
      note: "surgery",
      days: 5,
      version: 0,
      canEdit: true,
      canCancel: true,
      canDecide: false,
    });
    expect(balances[0]).toMatchObject({
      userId: requester.id,
      types: { sick: { pendingDays: 5 }, vacation: { pendingDays: 0 } },
    });

    const overlapping = await request(`/workspace/${ws}`, "POST", {
      type: "vacation",
      startDate: endDate,
      endDate: addDays(endDate, 3),
    });
    expect(overlapping.status).toBe(409);
    expect((await overlapping.json()).code).toBe("TIME_OFF_OVERLAP");

    mockAuthenticatedSession(owner.user);
    const queue = await (await request(`/workspace/${ws}/pending`)).json();
    expect(queue.requests).toHaveLength(1);
    expect(queue.requests[0]).toMatchObject({
      id: pending.id,
      canDecide: true,
    });
    expect(
      queue.requests[0].overAllowanceDays.every(
        (y: { days: number }) => y.days === 0,
      ),
    ).toBe(true);

    const approved = await request(`/${pending.id}/approve`, "POST", {
      version: 0,
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).request.status).toBe("approved");
    const again = await request(`/${pending.id}/approve`, "POST", {
      version: 0,
    });
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("TIME_OFF_STATUS");

    mockAuthenticatedSession(colleague);
    const calendar = await request(
      `/workspace/${ws}?from=${addDays(startDate, -7)}&to=${addDays(endDate, 7)}`,
    );
    expect(calendar.status).toBe(200);
    const text = await calendar.text();
    expect(text).not.toMatch(/sick|surgery|approved/);
    expect(JSON.parse(text).entries).toEqual([
      { id: pending.id, userId: requester.id, startDate, endDate },
    ]);

    const hidden = await request(`/${pending.id}`);
    const unknown = await request("/no-such-request");
    expect(hidden.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await hidden.json()).toEqual(await unknown.json());
  });

  it("edits at a version, sets allowances and clears a removed member", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const ws = owner.workspace.id;
    const requester = await addWorkspaceMember(ws, "member");
    const request = timeOffClient(createApp().app);
    const startDate = mondayInWeeks(3);

    mockAuthenticatedSession(requester);
    const { request: created } = await (
      await request(`/workspace/${ws}`, "POST", {
        type: "vacation",
        startDate,
        endDate: addDays(startDate, 2),
      })
    ).json();
    const edited = await request(`/${created.id}`, "PATCH", { note: "beach" });
    expect((await edited.json()).request).toMatchObject({ version: 1 });
    const unchanged = await request(`/${created.id}`, "PATCH", {
      note: "beach",
    });
    expect((await unchanged.json()).request.version).toBe(1);

    mockAuthenticatedSession(owner.user);
    const stale = await request(`/${created.id}/approve`, "POST", {
      version: 0,
    });
    expect((await stale.json()).code).toBe("TIME_OFF_CHANGED");
    expect(
      (await request(`/${created.id}/approve`, "POST", { version: 1 })).status,
    ).toBe(200);

    mockAuthenticatedSession(requester);
    const late = await request(`/${created.id}`, "PATCH", { note: "x" });
    expect((await late.json()).code).toBe("TIME_OFF_STATUS");

    mockAuthenticatedSession(owner.user);
    const shortened = await request(`/${created.id}`, "PATCH", {
      endDate: startDate,
    });
    expect((await shortened.json()).request).toMatchObject({
      status: "approved",
      version: 2,
      days: 1,
    });
    expect(
      await (
        await request(`/workspace/${ws}/allowance/vacation`, "PUT", {
          days: 20,
        })
      ).json(),
    ).toEqual({ workspaceId: ws, type: "vacation", defaultAllowanceDays: 20 });
    const override = await request(
      `/workspace/${ws}/allowance/vacation/${requester.id}`,
      "PUT",
      { days: 10 },
    );
    expect(await override.json()).toMatchObject({
      types: { vacation: { allowanceDays: 10, allowanceSource: "override" } },
    });
    const cleared = await request(
      `/workspace/${ws}/allowance/vacation/${requester.id}`,
      "DELETE",
    );
    expect(await cleared.json()).toMatchObject({
      types: { vacation: { allowanceDays: 20, allowanceSource: "default" } },
    });
    const all = await (await request(`/workspace/${ws}/balances`)).json();
    expect(all.members).toHaveLength(2);

    mockAuthenticatedSession(requester);
    const { request: later } = await (
      await request(`/workspace/${ws}`, "POST", {
        type: "public_holiday",
        startDate: mondayInWeeks(5),
        endDate: mondayInWeeks(5),
        note: "private",
      })
    ).json();
    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ws),
          eq(schema.workspaceUserTable.userId, requester.id),
        ),
      );
    await handleMemberRemoved({
      workspaceId: ws,
      userId: requester.id,
      userRole: null,
    });
    const rows = await db
      .select()
      .from(schema.timeOffTable)
      .where(eq(schema.timeOffTable.userId, requester.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(created.id)).toMatchObject({
      status: "approved",
      note: null,
    });
    expect(byId.get(later.id)).toMatchObject({
      status: "cancelled",
      note: null,
      statusChangedBy: null,
    });

    mockAuthenticatedSession(owner.user);
    expect((await request(`/${created.id}`)).status).toBe(404);
  });
});
