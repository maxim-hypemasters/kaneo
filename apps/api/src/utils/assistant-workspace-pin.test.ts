import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vite-plus/test";
import { eventContext } from "../events";
import {
  getPinnedWorkspaceId,
  parseAssistantWorkspacePin,
} from "./assistant-workspace-pin";

describe("parseAssistantWorkspacePin", () => {
  it("returns the trimmed workspace id", () => {
    expect(parseAssistantWorkspacePin("  ws-1 ")).toBe("ws-1");
    expect(parseAssistantWorkspacePin("w".repeat(128))).toBe("w".repeat(128));
  });

  it("treats a missing or blank header as no pin", () => {
    expect(parseAssistantWorkspacePin(undefined)).toBeUndefined();
    expect(parseAssistantWorkspacePin("   ")).toBeUndefined();
  });

  it("refuses an over-long header instead of ignoring it", () => {
    expect(() => parseAssistantWorkspacePin("w".repeat(129))).toThrow(
      HTTPException,
    );
  });
});

describe("getPinnedWorkspaceId", () => {
  it("reads the pin from the request context", () => {
    expect(getPinnedWorkspaceId()).toBeUndefined();
    eventContext.run({ initiatorId: "user" }, () =>
      expect(getPinnedWorkspaceId()).toBeUndefined(),
    );
    eventContext.run({ initiatorId: "user", pinnedWorkspaceId: "ws-1" }, () =>
      expect(getPinnedWorkspaceId()).toBe("ws-1"),
    );
  });
});
