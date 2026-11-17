import { describe, expect, it, vi } from "vite-plus/test";
import type { ToolRegistrar } from "./register.js";
import { registerTimeOffTools } from "./time-off.js";

function setup() {
  const tools = new Map<
    string,
    {
      config: Parameters<ToolRegistrar["registerTool"]>[1];
      handler: Parameters<ToolRegistrar["registerTool"]>[2];
    }
  >();
  const server: ToolRegistrar = {
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
  const client = { json: vi.fn(async () => ({ ok: true })) };
  registerTimeOffTools(server, client as never);
  return { client, tools };
}

describe("time off tools", () => {
  it.each([
    [
      "list_time_off",
      { workspaceId: "w/1", from: "2026-12-01", to: "2026-12-31" },
      "/api/time-off/workspace/w%2F1?from=2026-12-01&to=2026-12-31",
      "GET",
      undefined,
    ],
    [
      "list_time_off",
      { workspaceId: "w", from: "2026-12-01", to: "2026-12-31", lang: "de" },
      "/api/time-off/workspace/w?from=2026-12-01&to=2026-12-31&lang=de",
      "GET",
      undefined,
    ],
    [
      "list_time_off_requests",
      { workspaceId: "w" },
      "/api/time-off/workspace/w/requests",
      "GET",
      undefined,
    ],
    [
      "list_time_off_requests",
      { workspaceId: "w", userId: "u/1", year: 2027 },
      "/api/time-off/workspace/w/requests?userId=u%2F1&year=2027",
      "GET",
      undefined,
    ],
    [
      "list_pending_time_off_requests",
      { workspaceId: "w" },
      "/api/time-off/workspace/w/pending",
      "GET",
      undefined,
    ],
    [
      "get_time_off_request",
      { timeOffId: "t/1" },
      "/api/time-off/t%2F1",
      "GET",
      undefined,
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "vacation",
        startDate: "2026-12-28",
        endDate: "2027-01-08",
        note: " Family trip ",
      },
      "/api/time-off/workspace/w",
      "POST",
      {
        type: "vacation",
        startDate: "2026-12-28",
        endDate: "2027-01-08",
        note: "Family trip",
      },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        userId: "u",
        type: "sick",
        startDate: "2026-11-16",
        endDate: "2026-11-16",
      },
      "/api/time-off/workspace/w",
      "POST",
      {
        userId: "u",
        type: "sick",
        startDate: "2026-11-16",
        endDate: "2026-11-16",
      },
    ],
    [
      "update_time_off_request",
      { timeOffId: "t", endDate: "2026-12-30", note: null },
      "/api/time-off/t",
      "PATCH",
      { endDate: "2026-12-30", note: null },
    ],
    [
      "cancel_time_off_request",
      { timeOffId: "t" },
      "/api/time-off/t/cancel",
      "POST",
      undefined,
    ],
    [
      "approve_time_off_request",
      { timeOffId: "t", version: 2 },
      "/api/time-off/t/approve",
      "POST",
      { version: 2 },
    ],
    [
      "decline_time_off_request",
      { timeOffId: "t", version: 0 },
      "/api/time-off/t/decline",
      "POST",
      { version: 0 },
    ],
    [
      "get_time_off_balance",
      { workspaceId: "w", year: 2026 },
      "/api/time-off/workspace/w/balance?year=2026",
      "GET",
      undefined,
    ],
    [
      "list_time_off_balances",
      { workspaceId: "w" },
      "/api/time-off/workspace/w/balances",
      "GET",
      undefined,
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "public_holiday",
        startDate: "2026-12-24",
        endDate: "2026-12-24",
      },
      "/api/time-off/workspace/w",
      "POST",
      {
        type: "public_holiday",
        startDate: "2026-12-24",
        endDate: "2026-12-24",
      },
    ],
    [
      "set_time_off_allowance",
      { workspaceId: "w", type: "vacation", days: 30 },
      "/api/time-off/workspace/w/allowance/vacation",
      "PUT",
      { days: 30 },
    ],
    [
      "set_time_off_allowance",
      { workspaceId: "w", type: "sick", userId: "u/1", days: 20 },
      "/api/time-off/workspace/w/allowance/sick/u%2F1",
      "PUT",
      { days: 20 },
    ],
    [
      "set_time_off_allowance",
      { workspaceId: "w", type: "public_holiday", userId: "u", days: null },
      "/api/time-off/workspace/w/allowance/public_holiday/u",
      "DELETE",
      undefined,
    ],
  ])("%s uses the narrow contract", async (name, args, path, method, body) => {
    const { client, tools } = setup();
    const result = await tools.get(String(name))!.handler(args);
    expect(result.isError).toBe(false);
    expect(client.json).toHaveBeenCalledWith(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  });

  it.each([
    ["list_time_off", { workspaceId: "w", from: "2026-12-01" }],
    [
      "list_time_off",
      { workspaceId: "w", from: "2026-12-31", to: "2026-12-01" },
    ],
    [
      "list_time_off",
      { workspaceId: "w", from: "2026-02-30", to: "2026-03-01" },
    ],
    ["list_time_off_requests", { workspaceId: "w", year: 2026.5 }],
    ["list_time_off_requests", { workspaceId: " " }],
    ["get_time_off_request", { timeOffId: "" }],
    [
      "request_time_off",
      { workspaceId: "w", startDate: "2026-12-01", endDate: "2026-12-02" },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "holiday",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
      },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "personal",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
      },
    ],
    ["update_time_off_request", { timeOffId: "t", type: "other" }],
    [
      "list_time_off",
      { workspaceId: "w", from: "2026-12-01", to: "2026-12-31", lang: "d" },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "vacation",
        startDate: "2026-12-02",
        endDate: "2026-12-01",
      },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "vacation",
        startDate: "2026-12-01T09:00:00Z",
        endDate: "2026-12-02",
      },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "vacation",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        status: "approved",
      },
    ],
    [
      "request_time_off",
      {
        workspaceId: "w",
        type: "vacation",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        note: "x".repeat(501),
      },
    ],
    ["update_time_off_request", { timeOffId: "t" }],
    [
      "update_time_off_request",
      { timeOffId: "t", startDate: "2026-12-05", endDate: "2026-12-04" },
    ],
    ["update_time_off_request", { timeOffId: "t", status: "approved" }],
    ["approve_time_off_request", { timeOffId: "t" }],
    ["approve_time_off_request", { timeOffId: "t", version: -1 }],
    ["decline_time_off_request", { timeOffId: "t" }],
    ["set_time_off_allowance", { workspaceId: "w", days: 30 }],
    ["set_time_off_allowance", { workspaceId: "w", type: "personal", days: 5 }],
    [
      "set_time_off_allowance",
      { workspaceId: "w", type: "vacation", days: null },
    ],
    ["set_time_off_allowance", { workspaceId: "w", type: "sick", userId: "u" }],
    ["set_time_off_allowance", { workspaceId: "w", type: "sick", days: 367 }],
    ["set_time_off_allowance", { workspaceId: "w", type: "sick", days: 2.5 }],
  ])("%s rejects invalid input without a request", async (name, args) => {
    const { client, tools } = setup();
    const result = await tools.get(name)!.handler(args);
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("returns API conflicts as tool errors", async () => {
    const { client, tools } = setup();
    client.json.mockRejectedValueOnce(
      new Error(
        "/api/time-off/workspace/w: Overlaps another request for these days (TIME_OFF_OVERLAP)",
      ),
    );
    const result = await tools.get("request_time_off")!.handler({
      workspaceId: "w",
      type: "vacation",
      startDate: "2026-12-01",
      endDate: "2026-12-02",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("TIME_OFF_OVERLAP"),
    });
  });

  it("names the permission each tool needs", () => {
    const { tools } = setup();
    expect(tools.size).toBe(12);
    for (const [name, { config }] of tools) {
      expect(config.description, name).toMatch(
        /time_off:(read|create|approve)/,
      );
    }
  });

  it("tells agents how the approval flow works", () => {
    const { tools } = setup();
    const about = (name: string) => tools.get(name)!.config.description;
    expect(about("request_time_off")).toMatch(/starts pending/);
    expect(about("request_time_off")).toMatch(/409 TIME_OFF_OVERLAP/);
    expect(about("list_time_off")).toMatch(/only who is away and when/);
    for (const name of ["approve_time_off_request", "decline_time_off_request"])
      expect(about(name)).toMatch(/get_time_off_request first/);
    expect(about("list_pending_time_off_requests")).toMatch(
      /overAllowanceDays/,
    );
  });

  it("explains per-type allowances and working days", () => {
    const { tools } = setup();
    const about = (name: string) => tools.get(name)!.config.description;
    for (const name of [
      "get_time_off_balance",
      "list_time_off_balances",
      "list_time_off_requests",
    ]) {
      expect(about(name)).toMatch(/own allowance/);
      expect(about(name)).toMatch(/calendar public holidays/);
    }
    expect(about("get_time_off_balance")).toMatch(/public_holiday 10/);
    expect(about("set_time_off_allowance")).toMatch(/one type/);
    expect(about("request_time_off")).toMatch(/TIME_OFF_NO_WEEKDAYS/);
    expect(about("list_time_off")).toMatch(/holidays only userId and date/);
  });
});
