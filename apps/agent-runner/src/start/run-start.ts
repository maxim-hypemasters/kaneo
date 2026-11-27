import { rm } from "node:fs/promises";
import { GitHubAuthError } from "../github/github-tokens";
import type { FailureCode, RunClaim } from "../kaneo/client";
import { reportStop } from "../loop/report-stop";
import { startRunSession } from "../loop/run-session";
import { CommandError } from "../process/run-command";
import { branchHead } from "../repo/branch-head";
import { addEmptyCommit, preparePushRepo, pushBranch } from "../repo/push-repo";
import { withRepoLock } from "../repo/repo-lock";
import { updateMirror } from "../repo/update-mirror";
import { runPaths, runWorkId } from "../repo/work-paths";
import type { RunDeps } from "../run-deps";
import { openPullRequest } from "../ship/open-pull-request";
import type { PullRequest } from "../ship/pick-own-pull-request";
import { startPullRequestBody } from "./start-pull-request-body";

// No agent runs, only a fetch, a push and gh; but the first fetch of a large
// repository is a whole clone.
const START_TIMEOUT_MS = 10 * 60_000;

/**
 * Starts the task's branch and opens a draft pull request from it, without
 * Hermes. A branch with nothing over the base gets one empty commit, since
 * GitHub opens no pull request without one. The push is never forced, so
 * work already on the branch stays, and an open pull request is reused.
 */
export async function runStart(deps: RunDeps, claim: RunClaim) {
  const { config, kaneo, redact } = deps;
  const { run, context } = claim;
  const repository = context.project.repository;
  const baseBranch = context.project.baseBranch;
  const branch = context.branchName;
  if (!repository || !config.github || branch === baseBranch) {
    await kaneo.fail(run, {
      code: "git_failed",
      message: !repository
        ? "The project has no repository"
        : !config.github
          ? "The runner has no GitHub credentials"
          : "The branch name equals the base branch",
    });
    return;
  }

  const session = startRunSession(kaneo, run, {
    timeoutMs: START_TIMEOUT_MS,
    redact,
    shutdown: deps.shutdown,
    log: deps.log,
  });
  const step = (message: string) => session.events.push("step", message);
  const fail = (code: FailureCode, message: string) =>
    kaneo.fail(run, { code, message: redact(message).slice(0, 2000) });
  // Asked for at each step: a GitHub App's token can expire.
  const writeToken = async () => {
    const token = await deps.github(repository, "write", session.signal);
    if (!token)
      throw new GitHubAuthError("The runner has no GitHub credentials");
    return token;
  };
  // Only the runner's own push copy: nothing here runs as a Hermes user.
  const paths = runPaths(config.workDir, runWorkId(run));
  try {
    step(`Preparing ${repository} from ${baseBranch}`);
    await rm(paths.pushRepo, { recursive: true, force: true });
    const fetchToken = await writeToken();
    const heads = await withRepoLock(repository, async () => {
      const mirror = await updateMirror(
        config,
        repository,
        fetchToken,
        session.signal,
      );
      return {
        base: await branchHead(config, mirror, baseBranch),
        branch: await branchHead(config, mirror, branch),
      };
    });
    if (!heads.base) {
      await fail(
        "git_failed",
        `Base branch ${baseBranch} was not found in ${repository}`,
      );
      return;
    }

    const work = await preparePushRepo(config, {
      repository,
      paths,
      baseBranch,
      startSha: heads.branch ?? heads.base,
      bundle: null,
      signal: session.signal,
    });
    if (work.overBase === 0) {
      if (await reportStop(kaneo, run, session)) return;
      step(
        heads.branch
          ? `Adding an empty start commit to ${branch}`
          : `Pushing new branch ${branch} from ${baseBranch}`,
      );
      await addEmptyCommit(config, {
        paths,
        message: `Start ${context.task.ticketId}: ${context.task.title}`,
        signal: session.signal,
      });
      await pushBranch(config, {
        repository,
        paths,
        branch,
        token: await writeToken(),
        signal: session.signal,
      });
    } else step(`${branch} already has commits; leaving it as it is`);

    if (await reportStop(kaneo, run, session)) return;
    step("Opening a draft pull request");
    const prToken = await writeToken();
    let pullRequest: PullRequest;
    try {
      pullRequest = await openPullRequest(config, {
        repository,
        baseBranch,
        branch,
        title: `${context.task.ticketId}: ${context.task.title}`,
        body: startPullRequestBody(context),
        draft: true,
        token: prToken,
        signal: session.signal,
      });
    } catch (error) {
      if (await reportStop(kaneo, run, session)) return;
      const why =
        error instanceof CommandError
          ? error.result.stderr.trim() || error.message
          : (error as Error).message;
      await fail(
        "git_failed",
        `Branch ${branch} is pushed, but GitHub didn't open a draft pull request: ${why}`,
      );
      return;
    }
    if (await reportStop(kaneo, run, session)) return;
    await session.events.flush();
    await kaneo.shipResult(run, {
      prUrl: pullRequest.url,
      branch,
      summary: "",
    });
  } catch (error) {
    if (!(await reportStop(kaneo, run, session)))
      await kaneo
        .fail(run, {
          code:
            error instanceof CommandError || error instanceof GitHubAuthError
              ? "git_failed"
              : "internal",
          message: redact((error as Error).message).slice(0, 2000),
        })
        .catch(() => {});
  } finally {
    await session.end();
    await rm(paths.pushRepo, { recursive: true, force: true });
  }
}
