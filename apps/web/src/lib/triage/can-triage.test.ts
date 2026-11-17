import { describe, expect, it } from "vite-plus/test";
import { canTriage, routesToTriage } from "./can-triage";

describe("canTriage", () => {
  it("lets triage members decide", () => {
    expect(
      canTriage({ userId: "a", memberIds: ["a"], canUpdateProjects: false }),
    ).toBe(true);
  });

  it("keeps project managers out while the list has members", () => {
    expect(
      canTriage({ userId: "b", memberIds: ["a"], canUpdateProjects: true }),
    ).toBe(false);
  });

  it("lets project managers clear work once the list is empty", () => {
    expect(
      canTriage({ userId: "b", memberIds: [], canUpdateProjects: true }),
    ).toBe(true);
    expect(
      canTriage({ userId: "b", memberIds: [], canUpdateProjects: false }),
    ).toBe(false);
  });

  it("waits for the list to load", () => {
    expect(
      canTriage({ userId: "a", memberIds: undefined, canUpdateProjects: true }),
    ).toBe(false);
  });
});

describe("routesToTriage", () => {
  it("routes only people outside a non-empty list", () => {
    expect(routesToTriage("b", ["a"])).toBe(true);
    expect(routesToTriage("a", ["a"])).toBe(false);
    expect(routesToTriage("b", [])).toBe(false);
    expect(routesToTriage("b", undefined)).toBe(false);
  });
});
