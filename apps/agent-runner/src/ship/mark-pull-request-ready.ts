import type { RunnerConfig } from "../config";
import { runCommand } from "../process/run-command";
import { ghEnv } from "./gh-env";
import type { PullRequest } from "./pick-own-pull-request";
import { readyPullRequestBody } from "./ready-pull-request-body";

/**
 * Turns the draft Start opened into the Ship's pull request: ready for
 * review, with the Ship's body in place of Start's text and after anything
 * people wrote on the draft. Leaves every other pull request as it is. The
 * work is pushed by then, so a refusal is reported as a step, not a failure.
 */
export async function markPullRequestReady(
  config: RunnerConfig,
  input: {
    pullRequest: PullRequest;
    body: string;
    // Start's sentence for this task, from startPullRequestText.
    startText: string;
    token: string;
    signal: AbortSignal;
    step: (message: string) => void;
  },
) {
  const { pullRequest } = input;
  if (!pullRequest.isDraft || !pullRequest.startedByKaneo) return;
  const env = ghEnv(config, input.token);
  try {
    input.step("Marking the pull request ready for review");
    await runCommand(config.ghBin, ["pr", "ready", pullRequest.url], {
      env,
      signal: input.signal,
      check: true,
    });
    await runCommand(
      config.ghBin,
      ["pr", "edit", pullRequest.url, "--body-file", "-"],
      {
        env,
        input: readyPullRequestBody({
          current: pullRequest.body,
          startText: input.startText,
          shipBody: input.body,
        }),
        signal: input.signal,
        check: true,
      },
    );
  } catch (error) {
    input.step(
      `Couldn't mark the pull request ready for review: ${(error as Error).message}`,
    );
  }
}
