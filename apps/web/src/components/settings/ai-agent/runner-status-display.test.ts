import { describe, expect, it } from "vite-plus/test";
import { runnerStatusDisplay } from "./runner-status-display";

describe("runnerStatusDisplay", () => {
  it("asks for a token when no runner is set up", () => {
    expect(
      runnerStatusDisplay({
        configured: false,
        online: false,
        lastSeenAt: null,
      }),
    ).toEqual({
      tone: "neutral",
      labelKey: "settings:aiAgentPage.runner.status.notSetUp",
      descriptionKey: "settings:aiAgentPage.runner.status.notSetUpDescription",
    });
  });

  it("shows a polling runner as online", () => {
    expect(
      runnerStatusDisplay({
        configured: true,
        online: true,
        lastSeenAt: "2026-11-26T10:00:00.000Z",
      }).tone,
    ).toBe("success");
  });

  it("tells a runner that went quiet from one that never connected", () => {
    expect(
      runnerStatusDisplay({
        configured: true,
        online: false,
        lastSeenAt: "2026-11-26T10:00:00.000Z",
      }).descriptionKey,
    ).toBe("settings:aiAgentPage.runner.status.offlineDescription");
    expect(
      runnerStatusDisplay({ configured: true, online: false, lastSeenAt: null })
        .descriptionKey,
    ).toBe("settings:aiAgentPage.runner.status.neverConnectedDescription");
  });
});
