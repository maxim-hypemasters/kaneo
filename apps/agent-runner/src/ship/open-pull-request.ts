import type { RunnerConfig } from "../config";
import { runCommand } from "../process/run-command";
import { ghEnv } from "./gh-env";
import {
  type ListedPullRequest,
  pickOwnPullRequest,
} from "./pick-own-pull-request";

/** Reuses the branch's own open pull request, or opens one. Returns its URL. */
export async function openPullRequest(
  config: RunnerConfig,
  input: {
    repository: string;
    baseBranch: string;
    branch: string;
    title: string;
    body: string;
    signal: AbortSignal;
  },
): Promise<string> {
  const env = ghEnv(config);
  const existing = await runCommand(
    config.ghBin,
    [
      "pr",
      "list",
      "--repo",
      input.repository,
      "--head",
      input.branch,
      "--state",
      "open",
      "--json",
      "url,isCrossRepository,headRepositoryOwner",
      "--limit",
      "50",
    ],
    { env, signal: input.signal, check: true },
  );
  const open = pickOwnPullRequest(
    JSON.parse(existing.stdout || "[]") as ListedPullRequest[],
    input.repository,
  );
  if (open) return open;

  const created = await runCommand(
    config.ghBin,
    [
      "pr",
      "create",
      "--repo",
      input.repository,
      "--base",
      input.baseBranch,
      "--head",
      input.branch,
      "--title",
      input.title,
      "--body-file",
      "-",
    ],
    { env, input: input.body, signal: input.signal, check: true },
  );
  const url = created.stdout.trim().split("\n").pop()?.trim();
  if (!url?.startsWith("https://"))
    throw new Error(`gh did not return a pull request URL: ${created.stdout}`);
  return url;
}
