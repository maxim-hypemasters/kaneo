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
import { START_MARKER } from "./ship/start-marker";
import { runStart } from "./start/run-start";
import {
  claimFor,
  createRemote,
  fakeGh,
  fakeKaneo,
  script,
  tempDir,
  testConfig,
} from "./test-support/fixtures";

// Finds the --in directory among Hermes's arguments.
const FIND_DIR =
  'dir=""; while [ $# -gt 0 ]; do [ "$1" = "--in" ] && dir="$2"; shift; done';

async function setup(
  hermesBody: (root: string) => string,
  gh: Parameters<typeof fakeGh>[1] = {},
) {
  const root = await tempDir();
  const remote = await createRemote(root);
  const hermes = await script(root, "hermes", hermesBody(root));
  const config = testConfig(root, {
    hermesBin: hermes,
    ghBin: await fakeGh(root, gh),
  });
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

// gh's calls without their token.
const ghCalls = async (ctx: Awaited<ReturnType<typeof setup>>) =>
  (await readFile(path.join(ctx.root, "gh.log"), "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/ token=.*$/, ""));

// Hermes leaves a fix uncommitted, which the runner commits.
const FIXES_IT = (root: string) => `${FIND_DIR}
cat > ${root}/prompt.txt
echo fixed > "$dir/login.txt"
echo '{"type":"text","text":"Fixed it."}'
echo '{"type":"result","exit_code":0,"text":"Fixed it."}'`;

// The draft Start opened for the branch.
const STARTED_DRAFT = {
  url: "https://github.com/acme/app/pull/5",
  isCrossRepository: false,
  headRepositoryOwner: { login: "acme" },
  isDraft: true,
  body: `Work on [HUB-7](http://kaneo/task/t1) started from Kaneo; no changes yet.\n\n${START_MARKER}`,
};

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
echo '{"type":"text","text":"Fixed the login form."}'
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
    expect(ghLog).not.toContain("--draft");
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
echo '{"type":"text","text":"Fixed it."}'
echo '{"type":"result","exit_code":0,"text":"Fixed it."}'`,
    );
    await runShip(ctx.deps, claimFor("ship"));
    expect(called(ctx, "fail")).toBeUndefined();
    expect(await ctx.remote.log("hub-7")).toEqual(["HUB-7: Fix login", "init"]);
  });

  it("opens the pull request for work an earlier run pushed", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"text","text":"Already done."}'
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
echo '{"type":"text","text":"Started over."}'
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
printf '%s\\n' '{"type":"text","text":"Two forms exist.\\n\`\`\`json\\n{\\"needs_input\\": [{\\"text\\": \\"Which form?\\", \\"options\\": [\\"Both\\"], \\"blocking\\": true}]}\\n\`\`\`"}'
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
echo '{"type":"text","text":"Fixed it."}'
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
echo '{"type":"text","text":"done"}'
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

  it("pushes nothing when Hermes's session dies after it worked and narrated", async () => {
    const ctx = await setup(
      () => `${FIND_DIR}
cat > /dev/null
cd "$dir"
echo half > login.txt
git add -A && git commit -q -m "Half the fix"
echo '{"type":"text","text":"Now i18n, store test, and route wiring."}'
echo 'killed' >&2
exit 137`,
    );
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-ship",
      {
        code: "agent_failed",
        message:
          "Hermes didn't finish, so nothing was pushed: Hermes's session ended before its result, with exit code 137: killed",
      },
    ]);
    expect(called(ctx, "shipResult")).toBeUndefined();
    expect(await ctx.remote.branches()).toEqual(["main"]);
    expect(existsSync(path.join(ctx.root, "gh.log"))).toBe(false);
  });

  it("pushes nothing when Hermes stopped its turn at its turn limit", async () => {
    const ctx = await setup(
      () => `${FIND_DIR}
cat > /dev/null
echo half > "$dir/login.txt"
echo '{"type":"text","text":"I ran out of steps; the store and routes are left."}'
echo '{"type":"result","exit_code":1,"text":"I ran out of steps; the store and routes are left."}'
exit 1`,
    );
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-ship",
      {
        code: "agent_failed",
        message:
          "Hermes didn't finish, so nothing was pushed: Hermes stopped before finishing its turn, for example at its turn limit (exit code 1)",
      },
    ]);
    expect(await ctx.remote.branches()).toEqual(["main"]);
  });

  it("pushes nothing for a completed turn without a real answer", async () => {
    // Hermes settles these as completed (exit code 0): a stream cut short,
    // with its explanation after the fragment; a model that gave up after a
    // tool call; Hermes's own error notice; narration recovered after an
    // empty reply; an empty reply with Hermes's file-edit footer.
    const endings: Array<[streamed: string, text: string]> = [
      [
        "Now i18n, store test",
        "Now i18n, store test\\n\\n⚠️ No reply: the stream stopped early and only a partial response was recovered.",
      ],
      ["", ""],
      ["", "(empty)"],
      [
        "Done with the store.",
        "Hermes hit an internal error while handling the reply and stopped this turn.",
      ],
      ["", "Now i18n, store test, and route wiring."],
      [
        "",
        "(empty)\\n\\n⚠️ File-mutation verifier: 1 file edit(s) FAILED this turn",
      ],
    ];
    for (const [streamed, text] of endings) {
      const ctx = await setup(
        () => `${FIND_DIR}
cat > /dev/null
echo half > "$dir/login.txt"
echo '{"type":"text","text":"Now i18n, store test, and route wiring."}'
echo '{"type":"tool_use","name":"todo_list"}'
echo '{"type":"tool_result","name":"todo_list","output":"ok"}'
echo '{"type":"text","text":"${streamed}"}'
echo '{"type":"result","exit_code":0,"text":"${text}"}'`,
      );
      await runShip(ctx.deps, claimFor("ship"));

      expect(called(ctx, "fail")?.[2]).toMatchObject({
        code: "agent_failed",
        message: expect.stringContaining(
          "Hermes didn't finish, so nothing was pushed: Hermes ended its turn without a final answer from the model",
        ),
      });
      expect(await ctx.remote.branches()).toEqual(["main"]);
    }
  });

  it("ships a real answer, though it quotes Hermes's wording or Hermes adds a footer", async () => {
    const answers: Array<[streamed: string, text: string]> = [
      [
        'Added NO_REPLY = \\"⚠️ No reply: \\" to run-hermes.ts.',
        'Added NO_REPLY = \\"⚠️ No reply: \\" to run-hermes.ts.',
      ],
      [
        "Fixed the login form.",
        "Fixed the login form.\\n\\n⚠️ File-mutation verifier: 1 file edit(s) FAILED this turn",
      ],
    ];
    for (const [streamed, text] of answers) {
      const ctx = await setup(
        () => `${FIND_DIR}
cat > /dev/null
echo fixed > "$dir/login.txt"
echo '{"type":"tool_use","name":"patch"}'
echo '{"type":"tool_result","name":"patch","output":"ok"}'
echo '{"type":"text","text":"\\n\\n${streamed}"}'
echo '{"type":"result","exit_code":0,"text":"${text}"}'`,
      );
      await runShip(ctx.deps, claimFor("ship"));

      expect(called(ctx, "fail")).toBeUndefined();
      expect(called(ctx, "shipResult")).toBeDefined();
    }
  });

  it("tells Hermes that the branch Start pushed has no work yet", async () => {
    const ctx = await setup(FIXES_IT);
    await ctx.remote.pushEmptyBranch("hub-7");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    const prompt = await readFile(path.join(ctx.root, "prompt.txt"), "utf8");
    expect(prompt).toContain(
      "It is on the branch hub-7, started from main, with no work on it yet.",
    );
    expect(prompt).not.toContain("earlier work");
    expect(eventMessages(ctx)).toContain(
      "Working on branch hub-7, which has no work yet",
    );
    expect(await ctx.remote.log("hub-7")).toEqual([
      "HUB-7: Fix login",
      "Start",
      "init",
    ]);
  });

  it("reports no changes when Hermes adds nothing to the branch Start pushed", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"text","text":"Nothing to do."}'
echo '{"type":"result","exit_code":0,"text":"Nothing to do."}'`,
      { pulls: [STARTED_DRAFT] },
    );
    await ctx.remote.pushEmptyBranch("hub-7");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-ship",
      { code: "no_changes", message: "Nothing to do." },
    ]);
    expect(called(ctx, "shipResult")).toBeUndefined();
    expect(await ctx.remote.log("hub-7")).toEqual(["Start", "init"]);
    expect(existsSync(path.join(ctx.root, "gh.log"))).toBe(false);
  });

  it("marks the draft Start opened ready for review, with the Ship's summary", async () => {
    const ctx = await setup(FIXES_IT, { pulls: [STARTED_DRAFT] });
    await ctx.remote.pushEmptyBranch("hub-7");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toMatchObject([
      "shipResult",
      "run-ship",
      { prUrl: STARTED_DRAFT.url, branch: "hub-7", summary: "Fixed it." },
    ]);
    const calls = await ghCalls(ctx);
    expect(calls[0]).toMatch(/^pr list /);
    expect(calls.slice(1)).toEqual([
      `pr ready ${STARTED_DRAFT.url}`,
      `pr edit ${STARTED_DRAFT.url} --body-file -`,
    ]);
    const body = await readFile(
      path.join(ctx.root, "gh-edit-body.txt"),
      "utf8",
    );
    expect(body).toMatch(/^Fixed it\./);
    expect(body).not.toContain(START_MARKER);
    expect(body).not.toContain("started from Kaneo");
    expect(eventMessages(ctx)).toContain(
      "Marking the pull request ready for review",
    );
  });

  it("keeps what people wrote on Start's draft when the Ship fills it in", async () => {
    const note = "Design note: keep the old endpoint.\r\n- [ ] Check mobile";
    const ctx = await setup(FIXES_IT, {
      pulls: [
        {
          ...STARTED_DRAFT,
          body: STARTED_DRAFT.body.replace(
            START_MARKER,
            `${note}\r\n\r\n${START_MARKER}`,
          ),
        },
      ],
    });
    await ctx.remote.pushEmptyBranch("hub-7");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    const body = await readFile(
      path.join(ctx.root, "gh-edit-body.txt"),
      "utf8",
    );
    expect(body.startsWith(`${note}\n\n---\n\nFixed it.`)).toBe(true);
    expect(body).not.toContain(START_MARKER);
    expect(body).not.toContain("started from Kaneo");
  });

  it("leaves a draft pull request a person opened as it is", async () => {
    const ctx = await setup(FIXES_IT, {
      pulls: [{ ...STARTED_DRAFT, body: "WIP, don't merge yet" }],
    });
    await ctx.remote.pushBranch("hub-7", "Work in progress");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toMatchObject([
      "shipResult",
      "run-ship",
      { prUrl: STARTED_DRAFT.url },
    ]);
    expect(await ghCalls(ctx)).toEqual([expect.stringMatching(/^pr list /)]);
  });

  it("ships though GitHub refuses to mark Start's draft ready", async () => {
    const ctx = await setup(FIXES_IT, {
      pulls: [STARTED_DRAFT],
      failOn: ["ready"],
    });
    await ctx.remote.pushEmptyBranch("hub-7");
    await runShip(ctx.deps, claimFor("ship"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toMatchObject([
      "shipResult",
      "run-ship",
      { prUrl: STARTED_DRAFT.url },
    ]);
    expect(eventMessages(ctx)).toContainEqual(
      expect.stringContaining(
        "Couldn't mark the pull request ready for review",
      ),
    );
    expect(await ghCalls(ctx)).not.toContainEqual(
      expect.stringMatching(/^pr edit /),
    );
  });

  it("reports no changes when Hermes commits nothing", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"text","text":"Nothing to do."}'
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

// Start runs no Hermes.
const NO_HERMES = (root: string) => `touch ${root}/hermes-ran`;

describe("runStart", () => {
  it("pushes a new branch with one empty commit over the base, then opens a draft pull request", async () => {
    const ctx = await setup(NO_HERMES);
    await runStart(ctx.deps, claimFor("start"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toEqual([
      "shipResult",
      "run-start",
      {
        prUrl: "https://github.com/acme/app/pull/12",
        branch: "hub-7",
        summary: "",
      },
    ]);
    expect(await ctx.remote.log("hub-7")).toEqual([
      "Start HUB-7: Fix login",
      "init",
    ]);
    const tree = async (ref: string) =>
      (
        await runCommand(
          "git",
          ["--git-dir", ctx.remote.bare, "rev-parse", `${ref}^{tree}`],
          { check: true },
        )
      ).stdout.trim();
    expect(await tree("hub-7")).toBe(await tree("main"));
    expect(await ghCalls(ctx)).toEqual([
      expect.stringMatching(/^pr list --repo acme\/app --head hub-7 /),
      "pr create --repo acme/app --base main --head hub-7 --title HUB-7: Fix login --body-file - --draft",
    ]);
    expect(
      await readFile(path.join(ctx.root, "gh-create-body.txt"), "utf8"),
    ).toBe(STARTED_DRAFT.body);
    expect(eventMessages(ctx)).toContain("Pushing new branch hub-7 from main");
    expect(existsSync(path.join(ctx.root, "hermes-ran"))).toBe(false);
    expect(
      existsSync(path.join(ctx.config.workDir, "push", "run-start-1.git")),
    ).toBe(false);
  });

  it("adds no commit to a branch that already has work", async () => {
    const ctx = await setup(NO_HERMES);
    await ctx.remote.pushBranch("hub-7", "Earlier work");
    await runStart(ctx.deps, claimFor("start"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toMatchObject([
      "shipResult",
      "run-start",
      { prUrl: "https://github.com/acme/app/pull/12", branch: "hub-7" },
    ]);
    expect(await ctx.remote.log("hub-7")).toEqual(["Earlier work", "init"]);
    expect(eventMessages(ctx)).toContain(
      "hub-7 already has commits; leaving it as it is",
    );
    expect((await ghCalls(ctx))[1]).toMatch(/^pr create .* --draft$/);
  });

  it("reuses the branch's open pull request", async () => {
    const ctx = await setup(NO_HERMES, { pulls: [STARTED_DRAFT] });
    await ctx.remote.pushEmptyBranch("hub-7");
    await runStart(ctx.deps, claimFor("start"));

    expect(called(ctx, "fail")).toBeUndefined();
    expect(called(ctx, "shipResult")).toEqual([
      "shipResult",
      "run-start",
      { prUrl: STARTED_DRAFT.url, branch: "hub-7", summary: "" },
    ]);
    expect(await ctx.remote.log("hub-7")).toEqual(["Start", "init"]);
    expect(await ghCalls(ctx)).toEqual([expect.stringMatching(/^pr list /)]);
  });

  it("fails as a git failure when GitHub doesn't open the draft, with the branch pushed", async () => {
    const ctx = await setup(NO_HERMES, { failOn: ["create"] });
    await runStart(ctx.deps, claimFor("start"));

    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-start",
      {
        code: "git_failed",
        message:
          "Branch hub-7 is pushed, but GitHub didn't open a draft pull request: gh create refused",
      },
    ]);
    expect(called(ctx, "shipResult")).toBeUndefined();
    expect(await ctx.remote.branches()).toContain("hub-7");
  });

  it("fails before touching the repository without GitHub credentials", async () => {
    const ctx = await setup(NO_HERMES);
    await runStart(
      { ...ctx.deps, config: { ...ctx.config, github: null } },
      claimFor("start"),
    );

    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-start",
      { code: "git_failed", message: "The runner has no GitHub credentials" },
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
echo '{"type":"text","text":"{\\"score\\": 85}"}'
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
  echo '{"type":"text","text":"{\\"score\\": 85}"}'
  echo '{"type":"result","exit_code":0,"text":"{\\"score\\": 85}"}'
else
  touch ${root}/asked
  echo '{"type":"text","text":"Here: {\\"score\\": 200}"}'
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
echo '{"type":"text","text":"{\\"questions\\": [{\\"text\\": \\"Use ghp_testtokentesttokentesttoken?\\"}]}"}'
echo '{"type":"result","exit_code":0,"text":"{\\"questions\\": [{\\"text\\": \\"Use ghp_testtokentesttokentesttoken?\\"}]}"}'`,
    );
    await runAssess(ctx.deps, claimFor("assess"));
    expect(called(ctx, "assessment")).toEqual([
      "assessment",
      "run-assess",
      { questions: [{ text: "Use [redacted]?" }] },
    ]);
  });

  it("submits nothing from a session that didn't finish, though its narration holds JSON", async () => {
    const ctx = await setup(
      (root) => `cat > /dev/null
echo asked >> ${root}/asked.txt
echo '{"type":"text","text":"Draft: {\\"score\\": 90}"}'
exit 1`,
    );
    await runAssess(ctx.deps, claimFor("assess"));

    expect(called(ctx, "assessment")).toBeUndefined();
    expect(called(ctx, "fail")).toEqual([
      "fail",
      "run-assess",
      {
        code: "agent_failed",
        message:
          "Hermes failed: Hermes's session ended before its result, with exit code 1",
      },
    ]);
    // No repair round for an unfinished session.
    expect(await readFile(path.join(ctx.root, "asked.txt"), "utf8")).toBe(
      "asked\n",
    );
  });

  it("submits the answer Hermes gives at its turn limit", async () => {
    const ctx = await setup(
      () => `cat > /dev/null
echo '{"type":"text","text":"{\\"score\\": 70}"}'
echo '{"type":"result","exit_code":1,"text":"{\\"score\\": 70}"}'
exit 1`,
    );
    await runAssess(ctx.deps, claimFor("assess"));

    expect(called(ctx, "assessment")).toEqual([
      "assessment",
      "run-assess",
      { score: 70 },
    ]);
    expect(called(ctx, "fail")).toBeUndefined();
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
