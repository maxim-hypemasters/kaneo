import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RunnerConfig } from "../config";
import type { KaneoClient, RunClaim } from "../kaneo/client";
import { runCommand } from "../process/run-command";

export async function tempDir() {
  return mkdtemp(path.join(tmpdir(), "agent-runner-"));
}

export async function script(dir: string, name: string, body: string) {
  const file = path.join(dir, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`);
  await chmod(file, 0o755);
  return file;
}

const git = (cwd: string, ...args: string[]) =>
  runCommand("git", args, {
    cwd,
    check: true,
    env: {
      PATH: process.env.PATH,
      HOME: cwd,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });

/** A bare "remote" at <root>/remotes/acme/app.git with one commit on main. */
export async function createRemote(root: string) {
  const seed = path.join(root, "seed");
  await runCommand("mkdir", ["-p", seed, path.join(root, "remotes", "acme")]);
  await git(seed, "init", "--quiet", "-b", "main");
  await writeFile(path.join(seed, "README.md"), "# App\n");
  await git(seed, "add", "-A");
  await git(seed, "commit", "--quiet", "-m", "init");
  const bare = path.join(root, "remotes", "acme", "app.git");
  await git(root, "clone", "--quiet", "--bare", seed, bare);
  return {
    bare,
    branches: async () =>
      (await git(bare, "branch", "--format=%(refname:short)")).stdout
        .trim()
        .split("\n"),
    log: async (ref: string) =>
      (await git(bare, "log", "--format=%s", ref)).stdout.trim().split("\n"),
    /** Pushes a branch with one commit on top of main, as an earlier Ship would. */
    pushBranch: async (branch: string, message: string) => {
      await git(seed, "checkout", "--quiet", "-B", branch, "main");
      await writeFile(path.join(seed, `${branch}.txt`), `${message}\n`);
      await git(seed, "add", "-A");
      await git(seed, "commit", "--quiet", "-m", message);
      await git(seed, "push", "--quiet", bare, `${branch}:${branch}`);
      await git(seed, "checkout", "--quiet", "main");
    },
  };
}

export function testConfig(root: string, overrides: Partial<RunnerConfig>) {
  return {
    apiUrl: "http://kaneo/api",
    runnerToken: "kar_test",
    githubToken: "ghp_testtokentesttokentesttoken",
    githubHost: "github.com",
    gitRemoteBase: `file://${path.join(root, "remotes")}`,
    ghBin: "gh",
    gitAuthorName: "Hermes Agent",
    gitAuthorEmail: "hermes@example.com",
    hermesBin: "hermes",
    hermesModel: "test/model",
    hermesProvider: "test",
    // Tests run Hermes as their own user.
    hermesUser: null,
    assessToolsets: ["file"],
    shipToolsets: ["file", "terminal"],
    workDir: path.join(root, "work"),
    assessConcurrency: 1,
    shipConcurrency: 1,
    pollIntervalMs: 1000,
    assessTimeoutMs: 60_000,
    shipTimeoutMs: 60_000,
    assessMaxTurns: 5,
    shipMaxTurns: 5,
    ...overrides,
  } satisfies RunnerConfig;
}

export function fakeKaneo() {
  const calls: Array<[string, ...unknown[]]> = [];
  const assessmentReplies: Array<string | null> = [];
  const client: KaneoClient = {
    claim: async () => null,
    heartbeat: async () => ({ cancelRequested: false }),
    events: async (run, events) => void calls.push(["events", run.id, events]),
    assessment: async (run, result) => {
      calls.push(["assessment", run.id, result]);
      return assessmentReplies.shift() ?? null;
    },
    shipResult: async (run, result) =>
      void calls.push(["shipResult", run.id, result]),
    fail: async (run, failure) => void calls.push(["fail", run.id, failure]),
  };
  return { client, calls, assessmentReplies };
}

export function claimFor(kind: "assess" | "ship"): RunClaim {
  return {
    run: { id: `run-${kind}`, kind, attempt: 1 },
    context: {
      task: {
        id: "t1",
        ticketId: "HUB-7",
        type: "bug",
        title: "Fix login",
        description: "Steps",
        priority: "high",
        status: "To Do",
        labels: [],
        url: "http://kaneo/task/t1",
      },
      comments: [],
      clarifications: [],
      relatedTasks: [],
      project: {
        name: "Hub",
        repository: "acme/app",
        baseBranch: "main",
        instructions: "",
      },
      branchName: "hub-7",
      resultSchema: kind === "assess" ? { type: "object" } : null,
    },
  };
}
