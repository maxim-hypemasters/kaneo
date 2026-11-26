import { describe, expect, it } from "vite-plus/test";
import { withRepoLock } from "./repo-lock";

describe("withRepoLock", () => {
  it("runs work for one key in order, even after a failure", async () => {
    const order: string[] = [];
    const slow = withRepoLock("a", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first");
      throw new Error("boom");
    });
    const fast = withRepoLock("a", async () => {
      order.push("second");
    });
    await expect(slow).rejects.toThrow("boom");
    await fast;
    expect(order).toEqual(["first", "second"]);
  });
});
