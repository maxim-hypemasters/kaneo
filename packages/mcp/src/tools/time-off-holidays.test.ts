import { describe, expect, it, vi } from "vite-plus/test";
import type { ToolRegistrar } from "./register.js";
import { registerTimeOffHolidayTools } from "./time-off-holidays.js";

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
  registerTimeOffHolidayTools(server, client as never);
  return { client, tools };
}

describe("holiday calendar tools", () => {
  it.each([
    [
      "list_holiday_countries",
      { workspaceId: "w/1" },
      "/api/time-off/workspace/w%2F1/holiday-countries",
      "GET",
      undefined,
    ],
    [
      "list_holiday_countries",
      { workspaceId: "w", lang: "de-DE" },
      "/api/time-off/workspace/w/holiday-countries?lang=de-DE",
      "GET",
      undefined,
    ],
    [
      "list_holiday_countries",
      { workspaceId: "w", country: "de", lang: "de" },
      "/api/time-off/workspace/w/holiday-countries/de/regions?lang=de",
      "GET",
      undefined,
    ],
    [
      "get_holiday_calendar",
      { workspaceId: "w" },
      "/api/time-off/workspace/w/holidays",
      "GET",
      undefined,
    ],
    [
      "get_holiday_calendar",
      { workspaceId: "w", userId: "u/1", year: 2027, lang: "fr" },
      "/api/time-off/workspace/w/holidays?userId=u%2F1&year=2027&lang=fr",
      "GET",
      undefined,
    ],
    [
      "set_holiday_calendar",
      { workspaceId: "w", country: "de", region: "by" },
      "/api/time-off/workspace/w/holiday-calendar",
      "PUT",
      { country: "de", region: "by" },
    ],
    [
      "set_holiday_calendar",
      { workspaceId: "w", userId: "u", country: "FR", region: null },
      "/api/time-off/workspace/w/holiday-calendar",
      "PUT",
      { userId: "u", country: "FR", region: null },
    ],
    [
      "set_holiday_calendar",
      { workspaceId: "w", country: null },
      "/api/time-off/workspace/w/holiday-calendar",
      "DELETE",
      undefined,
    ],
    [
      "set_holiday_calendar",
      { workspaceId: "w", userId: "u/1", country: null },
      "/api/time-off/workspace/w/holiday-calendar?userId=u%2F1",
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
    ["list_holiday_countries", { workspaceId: " " }],
    ["list_holiday_countries", { workspaceId: "w", country: "D E" }],
    ["list_holiday_countries", { workspaceId: "w", lang: "german!" }],
    ["get_holiday_calendar", { workspaceId: "w", year: 2027.5 }],
    ["set_holiday_calendar", { workspaceId: "w" }],
    ["set_holiday_calendar", { workspaceId: "w", country: "" }],
    ["set_holiday_calendar", { workspaceId: "w", country: null, region: "BY" }],
    [
      "set_holiday_calendar",
      { workspaceId: "w", country: "DE", region: "BY", extra: true },
    ],
  ])("%s rejects invalid input without a request", async (name, args) => {
    const { client, tools } = setup();
    const result = await tools.get(name)!.handler(args);
    expect(result.isError).toBe(true);
    expect(client.json).not.toHaveBeenCalled();
  });

  it("returns API errors as tool errors", async () => {
    const { client, tools } = setup();
    client.json.mockRejectedValueOnce(
      new Error(
        "/api/time-off/workspace/w/holiday-calendar: Unknown holiday country or region (TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN)",
      ),
    );
    const result = await tools.get("set_holiday_calendar")!.handler({
      workspaceId: "w",
      country: "ZZ",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN"),
    });
  });

  it("names permissions, effects and privacy", () => {
    const { tools } = setup();
    expect([...tools.keys()]).toEqual([
      "list_holiday_countries",
      "get_holiday_calendar",
      "set_holiday_calendar",
    ]);
    for (const [name, { config }] of tools)
      expect(config.description, name).toMatch(
        /time_off:(read|create|approve)/,
      );
    const about = (name: string) => tools.get(name)!.config.description;
    expect(about("set_holiday_calendar")).toMatch(/country null/);
    expect(about("set_holiday_calendar")).toMatch(/outdated/);
    expect(about("set_holiday_calendar")).toMatch(/status "pending"/);
    expect(about("set_holiday_calendar")).toMatch(/deadline \(a UTC day/);
    expect(about("set_holiday_calendar")).toMatch(
      /A new request notifies approvers; sending another change while one waits updates that request \(its version goes up\) without notifying anyone/,
    );
    expect(about("set_holiday_calendar")).not.toMatch(/approvers are notified/);
    expect(about("set_holiday_calendar")).toMatch(
      /cancel_holiday_calendar_request/,
    );
    expect(about("set_holiday_calendar")).not.toMatch(/Nobody is notified/);
    expect(about("get_holiday_calendar")).toMatch(/pendingRequest/);
    expect(about("get_holiday_calendar")).toMatch(/holidayCalendarDeadline/);
    expect(about("get_holiday_calendar")).toMatch(
      /never the holiday names, country or region/,
    );
  });
});
