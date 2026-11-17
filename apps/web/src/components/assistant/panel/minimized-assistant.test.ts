import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readMinimized, writeMinimized } from "./minimized-assistant";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("minimized assistant", () => {
  it("remembers minimizing per workspace until the chat opens again", () => {
    expect(readMinimized("ws1")).toBe(false);

    writeMinimized("ws1", true);
    expect(readMinimized("ws1")).toBe(true);
    expect(readMinimized("ws2")).toBe(false);

    writeMinimized("ws1", false);
    expect(readMinimized("ws1")).toBe(false);
  });

  it("works without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeMinimized("ws1", true)).not.toThrow();
    expect(readMinimized("ws1")).toBe(false);
  });
});
