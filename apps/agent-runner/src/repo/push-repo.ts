import path from "node:path";
import type { RunnerConfig } from "../config";
import { copyUntrustedFile } from "../isolation/copy-untrusted-file";
import { git, gitSucceeds, repositoryUrl } from "./git";
import { withRepoLock } from "./repo-lock";
import { mirrorPath, type RunPaths } from "./work-paths";

const OUT_REF = "refs/heads/kaneo-out";

/**
 * The runner's own bare copy of the repository to push from, with Hermes's
 * work on kaneo-out. Only the bundle's objects come from Hermes, checked on
 * the way in; nothing of its checkout's config or hooks does. Counts the
 * commits to push (over the start) and to ship (over the base branch), and
 * tells whether they change anything: an empty Start commit doesn't.
 */
export async function preparePushRepo(
  config: RunnerConfig,
  input: {
    repository: string;
    paths: RunPaths;
    baseBranch: string;
    startSha: string;
    bundle: string | null;
    signal?: AbortSignal;
  },
): Promise<{
  onStart: boolean;
  ahead: number;
  overBase: number;
  changed: boolean;
}> {
  const repo = input.paths.pushRepo;
  const inRepo = (args: string[]) => ["--git-dir", repo, ...args];
  // Under the repo lock, so another run's fetch can't repack the mirror
  // while it is copied.
  await withRepoLock(input.repository, () =>
    git(
      config,
      [
        "clone",
        "--bare",
        "--quiet",
        "--no-hardlinks",
        "--template=",
        mirrorPath(config.workDir, input.repository),
        repo,
      ],
      { signal: input.signal },
    ),
  );
  if (input.bundle) {
    const bundle = path.join(repo, "kaneo-out.bundle");
    await copyUntrustedFile(input.bundle, bundle, config.hermesUser);
    await git(config, inRepo(["bundle", "verify", "--quiet", bundle]));
    await git(
      config,
      inRepo([
        "-c",
        "transfer.fsckObjects=true",
        "fetch",
        "--no-tags",
        "--quiet",
        bundle,
        `HEAD:${OUT_REF}`,
      ]),
      { signal: input.signal },
    );
  } else await git(config, inRepo(["update-ref", OUT_REF, input.startSha]));

  const baseRef = `refs/heads/${input.baseBranch}`;
  const count = async (from: string) =>
    Number(
      await git(config, inRepo(["rev-list", "--count", `${from}..${OUT_REF}`])),
    );
  return {
    onStart: await gitSucceeds(
      config,
      inRepo(["merge-base", "--is-ancestor", input.startSha, OUT_REF]),
    ),
    ahead: await count(input.startSha),
    overBase: await count(baseRef),
    changed: !(await gitSucceeds(
      config,
      inRepo(["diff", "--quiet", `${baseRef}...${OUT_REF}`]),
    )),
  };
}

/**
 * Puts one commit on kaneo-out that changes nothing, as the runner's own
 * identity, so the branch has a commit over the base for GitHub to open a
 * pull request from. Returns its SHA.
 */
export async function addEmptyCommit(
  config: RunnerConfig,
  input: { paths: RunPaths; message: string; signal?: AbortSignal },
) {
  const inRepo = (args: string[]) => [
    "--git-dir",
    input.paths.pushRepo,
    ...args,
  ];
  const sha = await git(
    config,
    inRepo([
      "commit-tree",
      `${OUT_REF}^{tree}`,
      "-p",
      OUT_REF,
      "-m",
      input.message,
    ]),
    { signal: input.signal },
  );
  await git(config, inRepo(["update-ref", OUT_REF, sha]));
  return sha;
}

/** Pushes kaneo-out to the branch, with the token, to the GitHub URL itself. */
export async function pushBranch(
  config: RunnerConfig,
  input: {
    repository: string;
    paths: RunPaths;
    branch: string;
    token: string;
    signal?: AbortSignal;
  },
) {
  await git(
    config,
    [
      "--git-dir",
      input.paths.pushRepo,
      "push",
      "--quiet",
      "--no-verify",
      repositoryUrl(config, input.repository),
      `${OUT_REF}:refs/heads/${input.branch}`,
    ],
    { token: input.token, signal: input.signal },
  );
}
