import type { RunnerConfig } from "./config";
import type { GitHubTokens } from "./github/github-tokens";
import type { KaneoClient } from "./kaneo/client";
import type { Redact } from "./redact";

export type RunDeps = {
  config: RunnerConfig;
  kaneo: KaneoClient;
  redact: Redact;
  // A token for a repository, got when a step needs it: an app's expire.
  github: GitHubTokens;
  shutdown: AbortSignal;
  log: (message: string) => void;
};
