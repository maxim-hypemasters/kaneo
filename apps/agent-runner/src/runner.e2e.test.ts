import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { runAssess } from "./assess/run-assess";
import {
  createGitHubTokens,
  GitHubAuthError,
  type GitHubAccess,
} from "./github/github-tokens";
import { runCommand } from "./process/run-command";
import { createRedactor } from "./redact";
import { runShip } from "./ship/run-ship";
import {
  claimFor,
  createRemote,
  fakeKaneo,
  script,
  tempDir,
  testConfig,
} from "./test-support/fixtures";

// Finds the --in directory among Hermes's arguments.
const FIND_DIR =
  'dir=""; while [ $# -gt 0 ]; do [ "$1" = "--in" ] && dir="$2"; shift; done';

async function setup(hermesBody: (root: string) => string) {
  const root = await tempDir();
  const remote = await createRemote(root);
  const hermes = await script(root, "hermes", hermesBody(root));
  const gh = await script(
    root,
    "gh",
    `echo "$@ token=\${GH_TOKEN}" >> ${root}/gh.log
case "$2" in list) echo "[]";; create) echo "https://github.com/acme/app/pull/12";; esac`,
  );
  const config = testConfig(root, { hermesBin: hermes, ghBin: gh });
  const kaneo = fakeKaneo();
  const deps = {
    config,
    kaneo: kaneo.client,
    redact: createRedactor([
      "ghp_testtokentesttokentesttoken",
      config.runnerToken,
    ]),
    github: createGitHubTokens(config.github, config.githubHost),
    shutdown: new AbortController().signal,
    log: () => {},
  };
  return { root, remote, config, kaneo, deps };
}

const called = (ctx: Awaited<ReturnType<typeof setup>>, name: string) =>
  ctx.kaneo.calls.find(([call]) => call === name);

const eventMessages = (ctx: Awaited<ReturnType<typeof setup>>) =>
  ctx.kaneo.calls
    .filter(([name]) => name === "events")
    .flatMap(([, , batch]) => batch as Array<{ message: string }>)
    .map((event) => event.message);

describe("runShip", () => {
  it("lets Hermes commit, then pushes its bundle and opens the pull request itself", async () => {
    const ctx = await setup(
      (root) => `${FIND_DIR}
cat > ${root}/prompt.txt
env > ${root}/hermes-env.txt
cp "$HERMES_HOME/config.yaml" ${root}/hermes-config.txt
cd "$dir"
echo fixed > login.txt
git add -A && git commit -q -m "Fix the login form"
echo '{"type":"system","subtype":"init"}'
echo '{"type":"tool_use","name":"terminal","input":{"command":"pnpm test"}}'
echo '{"type":"result","exit_code":0,"text":"Fixed the login form."}'`,
    );
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toEqual([
      "shipResult",
      "run-ship",
      {
        prUrl: "https://github.com/acme/app/pull/12",
        branch: "hub-7",
        summary: "Fixed the login form.",
      },
    ]);
    expect(await ctx.remote.branches()).toContain("hub-7");
    expect(await ctx.remote.log("hub-7")).toEqual([
      "Fix the login form",
      "init",
    ]);

    const env = await readFile(path.join(ctx.root, "hermes-env.txt"), "utf8");
    expect(env).not.toContain("GH_TOKEN");
    expect(env).not.toContain("ghp_testtoken");
    const run = path.join(ctx.config.workDir, "runs", "run-ship-1");
    expect(env).toContain(`HERMES_HOME=${path.join(run, "hermes")}\n`);
    expect(env).toContain(`HOME=${path.join(run, "hermes", "home")}\n`);
    expect(
      await readFile(path.join(ctx.root, "hermes-config.txt"), "utf8"),
    ).toContain('- "*git push*"');
    expect(env).toContain(
      `HERMES_WRITE_SAFE_ROOT=${path.join(ctx.config.workDir, "runs", "run-ship-1")}\n`,
    );
    expect(await readFile(path.join(ctx.root, "prompt.txt"), "utf8")).toContain(
      "HUB-7",
    );
    const ghLog = await readFile(path.join(ctx.root, "gh.log"), "utf8");
    expect(ghLog).toContain(
      "pr create --repo acme/app --base main --head hub-7",
    );
    expect(ghLog).toContain("token=ghp_testtokentesttokentesttoken");

    const events = eventMessages(ctx);
    expect(events).toContain("terminal: pnpm test");
    expect(events).toContain("Pushing 1 commit to hub-7");
    const work = (...parts: string[]) =>
      path.join(ctx.config.workDir, ...parts);
    expect(existsSync(work("runs", "run-ship-1"))).toBe(false);
    expect(existsSync(work("push", "run-ship-1.git"))).toBe(false);
  });

  it("commits what Hermes left uncommitted", async () => {
    const ctx = await setup(
      () => `${FIND_DIR}
cat > /dev/null
echo fixed > "$dir/login.txt"
echo '{"type":"result","exit_code":0,"text":"Fixed it."}'`,
    );
    await runShip(ctx.deps, claimFor("ship"));
    expect(called(ctx, "fail")).toBeUndefined();
    expect(await ctx.remote.log("hub-7")).toEqual(["HUB-7: Fix login", "init"]);
  });

  it("opens the pull request for work an earlier run pushed", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"result","exit_code":0,"text":"Already done."}'`,
    );
    await ctx.remote.pushBranch("hub-7", "Earlier work");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toMatchObject([
      "shipResult",
      "run-ship",
      { prUrl: "https://github.com/acme/app/pull/12", branch: "hub-7" },
    ]);
    expect(await ctx.remote.log("hub-7")).toEqual(["Earlier work", "init"]);
    expect(eventMessages(ctx)).toContain("hub-7 already has the work");
  });

  it("refuses to push when Hermes rewrote the branch's history", async () => {
    const ctx = await setup(
      () => `${FIND_DIR}
cat > /dev/null
cd "$dir"
git reset -q --hard HEAD~1
echo other > other.txt
git add -A && git commit -q -m "Replace the earlier work"
echo '{"type":"result","exit_code":0,"text":"Started over."}'`,
    );
    await ctx.remote.pushBranch("hub-7", "Earlier work");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toMatchObject([
      "fail",
      "run-ship",
      {
        code: "git_failed",
        message: expect.stringContaining("rewrote the history"),
      },
    ]);
    expect(await ctx.remote.log("hub-7")).toEqual(["Earlier work", "init"]);
  });

  it("asks instead of pushing when Hermes needs a decision", async () => {
    const ctx = await setup(
      () => `${FIND_DIR}
cat > /dev/null
printf '%s\\n' '{"type":"result","exit_code":0,"text":"Two forms exist.\\n\`\`\`json\\n{\\"needs_input\\": [{\\"text\\": \\"Which form?\\", \\"options\\": [\\"Both\\"], \\"blocking\\": true}]}\\n\`\`\`"}'`,
    );
    await runShip(ctx.deps, claimFor("ship"));
    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-ship",
      {
        code: "needs_input",
        message: "Two forms exist.",
        questions: [{ text: "Which form?", options: ["Both"], blocking: true }],
      },
    ]);
    expect(await ctx.remote.branches()).toEqual(["main"]);
  });

  it("asks for a write token for the repository at each step, as an app's can expire", async () => {
    const ctx = await setup(
      () => `${FIND_DIR}
cat > /dev/null
echo fixed > "$dir/login.txt"
echo '{"type":"result","exit_code":0,"text":"Fixed it."}'`,
    );
    const asked: Array<[string, GitHubAccess]> = [];
    ctx.deps.github = async (repository, access) => {
      asked.push([repository, access]);
      return `ghs_apptoken${asked.length}apptokenapptoken`;
    };
    // Logs the token each git call gets; the runner's git takes PATH then.
    const realGit = (
      await runCommand("sh", ["-c", "command -v git"])
    ).stdout.trim();
    const bin = path.join(ctx.root, "bin");
    await mkdir(bin);
    await writeFile(
      path.join(bin, "git"),
      `#!/bin/sh\necho "\${KANEO_GIT_TOKEN:-none} $*" >> ${ctx.root}/git.log\nexec ${realGit} "$@"\n`,
      { mode: 0o755 },
    );
    const path0 = process.env.PATH;
    process.env.PATH = `${bin}:${path0}`;
    try {
      await runShip(ctx.deps, claimFor("ship"));
    } finally {
      process.env.PATH = path0;
    }

    expect(called(ctx, "fail")).toBeUndefined();
    expect(await ctx.remote.branches()).toContain("hub-7");
    // Before the checkout, the push and the pull request.
    expect(asked).toEqual([
      ["acme/app", "write"],
      ["acme/app", "write"],
      ["acme/app", "write"],
    ]);
    const lines = (await readFile(path.join(ctx.root, "git.log"), "utf8"))
      .split("\n")
      .filter(Boolean);
    const withToken = lines.filter((line) => !line.startsWith("none "));
    // The mirror's clone with the first token, the push with the second;
    // nothing else, Hermes's git included, gets one.
    expect(withToken).toHaveLength(2);
    expect(withToken[0]).toMatch(/^ghs_apptoken1\S* .* clone --mirror /);
    expect(withToken[1]).toMatch(/^ghs_apptoken2\S* .* push --quiet /);
    const ghLog = await readFile(path.join(ctx.root, "gh.log"), "utf8");
    expect(ghLog).toContain("pr create");
    expect(ghLog).not.toMatch(/token=(?!ghs_apptoken3)/);
  });

  it("fails as a git failure, before Hermes runs, when the app can't get write access", async () => {
    const ctx = await setup(
      (root) => `touch ${root}/hermes-ran
echo '{"type":"result","exit_code":0,"text":"done"}'`,
    );
    ctx.deps.github = async () => {
      throw new GitHubAuthError(
        "The GitHub App can't get write access to acme/app: Resource not accessible by integration. It needs Contents and Pull requests write access on that repository.",
      );
    };
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toMatchObject([
      "fail",
      "run-ship",
      {
        code: "git_failed",
        message: expect.stringContaining("can't get write access to acme/app"),
      },
    ]);
    expect(existsSync(path.join(ctx.root, "hermes-ran"))).toBe(false);
  });

  it("reports no changes when Hermes commits nothing", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"result","exit_code":0,"text":"Nothing to do."}'`,
    );
    await runShip(ctx.deps, claimFor("ship"));
    expect(called(ctx, "fail")).toMatchObject([
      "fail",
      "run-ship",
      { code: "no_changes" },
    ]);
    expect(await ctx.remote.branches()).toEqual(["main"]);
  });
});

describe("runAssess", () => {
  it("asks only for read access, and reads a public repository without a token", async () => {
    const ctx = await setup(
      (root) => `${FIND_DIR}
cat > /dev/null
ls "$dir" > ${root}/listing.txt
echo '{"type":"result","exit_code":0,"text":"{\\"score\\": 85}"}'`,
    );
    const asked: GitHubAccess[] = [];
    ctx.deps.github = async (_repository, access) => {
      asked.push(access);
      throw new GitHubAuthError("The GitHub App isn't installed on acme/app");
    };
    await runAssess(ctx.deps, claimFor("assess"));

    expect(asked).toEqual(["read"]);
    expect(called(ctx, "fail")).toBeUndefined();
    // The checkout still happened, without a token.
    expect(
      await readFile(path.join(ctx.root, "listing.txt"), "utf8"),
    ).toContain("README.md");
  });

  it("submits the JSON reply, repairing it once when the API rejects it", async () => {
    const ctx = await setup(
      (root) => `cat >> ${root}/prompts.txt
if [ -f ${root}/asked ]; then
  echo '{"type":"result","exit_code":0,"text":"{\\"score\\": 85}"}'
else
  touch ${root}/asked
  echo '{"type":"result","exit_code":0,"text":"Here: {\\"score\\": 200}"}'
fi`,
    );
    ctx.kaneo.assessmentReplies.push('{"issues":[{"path":"score"}]}', null);
    await runAssess(ctx.deps, claimFor("assess"));
    expect(
      ctx.kaneo.calls
        .filter(([name]) => name === "assessment")
        .map(([, , result]) => result),
    ).toEqual([{ score: 200 }, { score: 85 }]);
    expect(called(ctx, "fail")).toBeUndefined();
    const prompts = await readFile(path.join(ctx.root, "prompts.txt"), "utf8");
    expect(prompts).toContain("is checked out in the current directory");
    expect(prompts).toContain("rejected by the validator");
  });

  it("removes secrets from the assessment it submits", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"result","exit_code":0,"text":"{\\"summary\\": \\"Use ghp_testtokentesttokentesttoken\\"}"}'`,
    );
    await runAssess(ctx.deps, claimFor("assess"));
    expect(called(ctx, "assessment")).toEqual([
      "assessment",
      "run-assess",
      { summary: "Use [redacted]" },
    ]);
  });

  it("fails the run when Hermes errors", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"result","exit_code":2,"text":"","error":"credentials or agent init failed"}'
exit 2`,
    );
    await runAssess(ctx.deps, claimFor("assess"));
    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-assess",
      {
        code: "agent_failed",
        message: "Hermes failed: credentials or agent init failed",
      },
    ]);
  });
});
