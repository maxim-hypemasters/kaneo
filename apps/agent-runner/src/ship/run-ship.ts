import { runHermes } from "../hermes/run-hermes";
import type { FailureCode, RunClaim } from "../kaneo/client";
import { reportStop } from "../loop/report-stop";
import { startRunSession } from "../loop/run-session";
import { GitHubAuthError } from "../github/github-tokens";
import { CommandError } from "../process/run-command";
import { bundleHermesWork } from "../repo/bundle-hermes-work";
import type { BranchState } from "../repo/branch-state";
import { prepareCheckout } from "../repo/prepare-checkout";
import { preparePushRepo, pushBranch } from "../repo/push-repo";
import { prepareRunDir, removeRunDir } from "../repo/run-dir";
import { runWorkId } from "../repo/work-paths";
import type { RunDeps } from "../run-deps";
import { startPullRequestText } from "../start/start-pull-request-body";
import { buildShipPrompt } from "./build-ship-prompt";
import { markPullRequestReady } from "./mark-pull-request-ready";
import { openPullRequest } from "./open-pull-request";
import { parseNeedsInput } from "./parse-needs-input";
import { pullRequestBody } from "./pull-request-body";

const BRANCH_STEP: Record<BranchState, (branch: string) => string> = {
  new: (branch) => `Working on new branch ${branch}`,
  empty: (branch) => `Working on branch ${branch}, which has no work yet`,
  continued: (branch) => `Continuing branch ${branch}`,
};

/**
 * Has Hermes implement the task on its branch, then pushes and opens the
 * pull request itself. Hermes never holds the GitHub token: the runner takes
 * its commits as a bundle and pushes from a copy of the repository of its own.
 */
export async function runShip(deps: RunDeps, claim: RunClaim) {
  const { config, kaneo, redact } = deps;
  const { run, context } = claim;
  const workId = runWorkId(run);
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
    timeoutMs: config.shipTimeoutMs,
    redact,
    shutdown: deps.shutdown,
    log: deps.log,
  });
  const step = (message: string) => session.events.push("step", message);
  const fail = (code: FailureCode, message: string) =>
    kaneo.fail(run, { code, message: message.slice(0, 2000) });
  // Asked for at each step: a GitHub App's token can expire during a long run.
  const writeToken = async () => {
    const token = await deps.github(repository, "write", session.signal);
    if (!token)
      throw new GitHubAuthError("The runner has no GitHub credentials");
    return token;
  };
  try {
    step(`Preparing ${repository} from ${baseBranch}`);
    const paths = await prepareRunDir(config, workId);
    // Write access, checked before Hermes spends a run on work it can't push.
    const checkout = await prepareCheckout(config, {
      runId: workId,
      repository,
      baseBranch,
      branch,
      token: await writeToken(),
      signal: session.signal,
    });
    step(BRANCH_STEP[checkout.branchState](branch));

    const outcome = await runHermes(config, {
      prompt: buildShipPrompt(context, {
        branch,
        branchState: checkout.branchState,
      }),
      cwd: checkout.dir,
      hermesHome: paths.hermes,
      toolsets: config.shipToolsets,
      maxTurns: config.shipMaxTurns,
      yolo: true,
      writeRoot: paths.root,
      signal: session.signal,
      onEvent: (event) => session.events.push(event.kind, event.message),
    });
    if (await reportStop(kaneo, run, session)) return;

    const { summary, questions } = parseNeedsInput(redact(outcome.text));
    if (questions.length) {
      await kaneo.fail(run, {
        code: "needs_input",
        message: summary.slice(0, 2000) || "Hermes needs decisions to continue",
        questions,
      });
      return;
    }
    if (!outcome.finished) {
      // What Hermes left is unfinished work, so none of it leaves the runner.
      const why = redact(outcome.error ?? "Hermes didn't finish");
      deps.log(`Ship ${run.id} pushed nothing: ${why}`);
      await fail(
        "agent_failed",
        `Hermes didn't finish, so nothing was pushed: ${why}`,
      );
      return;
    }

    const title = `${context.task.ticketId}: ${context.task.title}`;
    const bundle = await bundleHermesWork(config, {
      paths,
      startSha: checkout.startSha,
      message: title,
      signal: session.signal,
    });
    const work = await preparePushRepo(config, {
      repository,
      paths,
      baseBranch,
      startSha: checkout.startSha,
      bundle,
      signal: session.signal,
    });
    if (!work.onStart) {
      await fail(
        "git_failed",
        `Hermes rewrote the history of ${branch}; the runner only pushes new commits on top of it`,
      );
      return;
    }
    // Against the base, not the start: an earlier run may have pushed the
    // work and stopped before its pull request was opened. An empty Start
    // commit is not work.
    if (!work.changed) {
      await fail("no_changes", summary || "Hermes made no changes");
      return;
    }

    if (work.ahead) {
      if (await reportStop(kaneo, run, session)) return;
      step(
        `Pushing ${work.ahead} commit${work.ahead === 1 ? "" : "s"} to ${branch}`,
      );
      await pushBranch(config, {
        repository,
        paths,
        branch,
        token: await writeToken(),
        signal: session.signal,
      });
    } else step(`${branch} already has the work`);

    if (await reportStop(kaneo, run, session)) return;
    step("Opening the pull request");
    const body = pullRequestBody(context, summary);
    const prToken = await writeToken();
    const pullRequest = await openPullRequest(config, {
      repository,
      baseBranch,
      branch,
      title,
      body,
      token: prToken,
      signal: session.signal,
    });
    await markPullRequestReady(config, {
      pullRequest,
      body,
      startText: startPullRequestText(context),
      token: prToken,
      signal: session.signal,
      step,
    });
    if (await reportStop(kaneo, run, session)) return;
    await session.events.flush();
    await kaneo.shipResult(run, {
      prUrl: pullRequest.url,
      branch,
      summary: summary.slice(0, 8000),
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
    await removeRunDir(config, workId);
  }
}
