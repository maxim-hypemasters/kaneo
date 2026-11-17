import { describe, expect, it, vi } from "vite-plus/test";
import type { ToolRegistrar } from "./register.js";
import { registerTimeOffHolidayRequestTools } from "./time-off-holiday-requests.js";

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
  registerTimeOffHolidayRequestTools(server, client as never);
  return { client, tools };
}

const requests = "/api/time-off/workspace/w/holiday-calendar-requests";

describe("holiday calendar request tools", () => {
  it.each([
    [
      "list_holiday_calendar_requests",
      { workspaceId: "w/1" },
      "/api/time-off/workspace/w%2F1/holiday-calendar-requests",
      "GET",
      undefined,
    ],
    [
      "list_holiday_calendar_requests",
      { workspaceId: "w", lang: "de" },
      `${requests}?lang=de`,
      "GET",
      undefined,
    ],
    [
      "approve_holiday_calendar_request",
      { workspaceId: "w", requestId: "r/1", version: 2 },
      `${requests}/r%2F1/approve`,
      "POST",
      { version: 2 },
    ],
    [
      "approve_holiday_calendar_request",
      { workspaceId: "w", requestId: "r", version: 0, lang: "fr" },
      `${requests}/r/approve?lang=fr`,
      "POST",
      { version: 0 },
    ],
    [
      "decline_holiday_calendar_request",
      { workspaceId: "w", requestId: "r", version: 1 },
      `${requests}/r/decline`,
      "POST",
      { version: 1 },
    ],
    [
      "cancel_holiday_calendar_request",
      { workspaceId: "w", requestId: "r" },
      `${requests}/r/cancel`,
      "POST",
      undefined,
    ],
    [
      "set_holiday_calendar_deadline",
      { workspaceId: "w", deadline: "2027-01-31" },
      "/api/time-off/workspace/w/settings",
      "PUT",
      { holidayCalendarDeadline: "2027-01-31" },
    ],
    [
      "set_holiday_calendar_deadline",
      { workspaceId: "w", deadline: null },
      "/api/time-off/workspace/w/settings",
      "PUT",
      { holidayCalendarDeadline: null },
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
    ["list_holiday_calendar_requests", { workspaceId: " " }],
    ["list_holiday_calendar_requests", { workspaceId: "w", lang: "german!" }],
    ["approve_holiday_calendar_request", { workspaceId: "w", requestId: "r" }],
    [
      "approve_holiday_calendar_request",
      { workspaceId: "w", requestId: "r", version: -1 },
    ],
    [
      "decline_holiday_calendar_request",
      { workspaceId: "w", requestId: "r", version: 0, extra: true },
    ],
    ["cancel_holiday_calendar_request", { workspaceId: "w", requestId: "" }],
    ["set_holiday_calendar_deadline", { workspaceId: "w" }],
    [
      "set_holiday_calendar_deadline",
      { workspaceId: "w", deadline: "2027-02-30" },
    ],
    [
      "set_holiday_calendar_deadline",
      { workspaceId: "w", deadline: "tomorrow" },
    ],
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
        `${requests}/r/approve: This request changed since you reviewed it (TIME_OFF_CHANGED)`,
      ),
    );
    const result = await tools
      .get("approve_holiday_calendar_request")!
      .handler({ workspaceId: "w", requestId: "r", version: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("TIME_OFF_CHANGED"),
    });
  });

  it("names permissions, versions and privacy", () => {
    const { tools } = setup();
    expect([...tools.keys()]).toEqual([
      "list_holiday_calendar_requests",
      "approve_holiday_calendar_request",
      "decline_holiday_calendar_request",
      "cancel_holiday_calendar_request",
      "set_holiday_calendar_deadline",
    ]);
    for (const [name, { config }] of tools)
      expect(config.description, name).toMatch(/time_off:(create|approve)/);
    const about = (name: string) => tools.get(name)!.config.description;
    for (const name of [
      "approve_holiday_calendar_request",
      "decline_holiday_calendar_request",
    ]) {
      expect(about(name)).toMatch(/409 TIME_OFF_CHANGED/);
      expect(about(name)).toMatch(
        /member is notified unless they decided it themselves/,
      );
    }
    expect(about("list_holiday_calendar_requests")).toMatch(
      /only to the member and to approvers/,
    );
    expect(about("cancel_holiday_calendar_request")).toMatch(
      /Your own needs time_off:create/,
    );
    expect(about("set_holiday_calendar_deadline")).toMatch(/UTC day/);
  });
});
