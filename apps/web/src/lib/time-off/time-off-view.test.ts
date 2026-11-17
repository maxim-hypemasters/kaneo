import { describe, expect, it } from "vite-plus/test";
import {
  availableTimeOffViews,
  isTimeOffView,
  resolveTimeOffView,
} from "./time-off-view";

const none = { canView: false, canRequest: false, canApprove: false };

describe("time-off views", () => {
  it("recognises the four views", () => {
    expect(isTimeOffView("team")).toBe(true);
    expect(isTimeOffView("balances")).toBe(true);
    expect(isTimeOffView("all")).toBe(false);
    expect(isTimeOffView(undefined)).toBe(false);
  });

  it("offers views by permission", () => {
    expect(availableTimeOffViews(none)).toEqual([]);
    expect(availableTimeOffViews({ ...none, canView: true })).toEqual([
      "team",
      "mine",
    ]);
    expect(availableTimeOffViews({ ...none, canRequest: true })).toEqual([
      "mine",
    ]);
    expect(
      availableTimeOffViews({
        canView: true,
        canRequest: true,
        canApprove: true,
      }),
    ).toEqual(["team", "mine", "approvals", "balances"]);
  });

  it("falls back to the first available view", () => {
    expect(resolveTimeOffView("approvals", ["team", "mine"])).toBe("team");
    expect(resolveTimeOffView("mine", ["team", "mine"])).toBe("mine");
    expect(resolveTimeOffView(undefined, ["mine"])).toBe("mine");
    expect(resolveTimeOffView("team", [])).toBeNull();
  });
});
