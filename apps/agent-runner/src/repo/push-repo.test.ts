import { describe, expect, it } from "vite-plus/test";
import { createRemote, tempDir, testConfig } from "../test-support/fixtures";
import { git } from "./git";
import { addEmptyCommit, preparePushRepo } from "./push-repo";
import { updateMirror } from "./update-mirror";
import { runPaths } from "./work-paths";

async function pushRepoSetup() {
  const root = await tempDir();
  const remote = await createRemote(root);
  const config = testConfig(root, {});
  const prepare = async (branch: string) => {
    const mirror = await updateMirror(config, "acme/app", null);
    const startSha = await git(config, [
      "--git-dir",
      mirror,
      "rev-parse",
      `refs/heads/${branch}`,
    ]);
    const paths = runPaths(config.workDir, `run-${branch}`);
    const work = await preparePushRepo(config, {
      repository: "acme/app",
      paths,
      baseBranch: "main",
      startSha,
      bundle: null,
    });
    const inRepo = (...args: string[]) =>
      git(config, ["--git-dir", paths.pushRepo, ...args]);
    return { paths, work, inRepo };
  };
  return { config, remote, prepare };
}

describe("preparePushRepo", () => {
  it("counts an empty Start commit as no change", async () => {
    const { remote, prepare } = await pushRepoSetup();
    await remote.pushEmptyBranch("started");
    await remote.pushBranch("worked", "Earlier work");

    expect((await prepare("main")).work).toEqual({
      onStart: true,
      ahead: 0,
      overBase: 0,
      changed: false,
    });
    expect((await prepare("started")).work).toMatchObject({
      overBase: 1,
      changed: false,
    });
    expect((await prepare("worked")).work).toMatchObject({
      overBase: 1,
      changed: true,
    });
  });
});

describe("addEmptyCommit", () => {
  it("adds one commit with the base's tree, as the runner's identity", async () => {
    const { config, prepare } = await pushRepoSetup();
    const { paths, inRepo } = await prepare("main");

    const sha = await addEmptyCommit(config, {
      paths,
      message: "HUB-7: Fix login",
    });

    expect(await inRepo("rev-parse", "refs/heads/kaneo-out")).toBe(sha);
    expect(
      await inRepo("rev-list", "--count", "refs/heads/main..kaneo-out"),
    ).toBe("1");
    expect(await inRepo("rev-parse", "kaneo-out^{tree}")).toBe(
      await inRepo("rev-parse", "main^{tree}"),
    );
    expect(
      await inRepo("log", "-1", "--format=%an <%ae>|%s", "kaneo-out"),
    ).toBe("Hermes Agent <hermes@example.com>|HUB-7: Fix login");
  });
});
