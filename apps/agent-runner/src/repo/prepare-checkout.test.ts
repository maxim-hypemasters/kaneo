import { describe, expect, it } from "vite-plus/test";
import { createRemote, tempDir, testConfig } from "../test-support/fixtures";
import { prepareCheckout } from "./prepare-checkout";

describe("prepareCheckout", () => {
  it("tells a new branch, one Start pushed and one with work apart", async () => {
    const root = await tempDir();
    const remote = await createRemote(root);
    await remote.pushEmptyBranch("started");
    await remote.pushBranch("worked", "Earlier work");
    // The base moving on doesn't make Start's branch look worked on.
    await remote.pushBranch("main", "Later on main");
    const config = testConfig(root, {});
    const stateOf = async (branch: string) =>
      (
        await prepareCheckout(config, {
          runId: `run-${branch}`,
          repository: "acme/app",
          baseBranch: "main",
          branch,
          token: null,
        })
      ).branchState;

    expect(await stateOf("fresh")).toBe("new");
    expect(await stateOf("started")).toBe("empty");
    expect(await stateOf("worked")).toBe("continued");
  });
});
