import type { RunnerConfig } from "./config";
import type { KaneoClient } from "./kaneo/client";
import type { Redact } from "./redact";

export type RunDeps = {
  config: RunnerConfig;
  kaneo: KaneoClient;
  redact: Redact;
  shutdown: AbortSignal;
  log: (message: string) => void;
};
