import path from "node:path";

/** A cached mirror per repository, shared by every run. */
export function mirrorPath(workDir: string, repository: string) {
  return path.join(workDir, "mirrors", `${repository.replace("/", "__")}.git`);
}

/**
 * Names one attempt's directories. A lost attempt can still be cleaning up
 * while Kaneo hands the run to another slot, so each attempt has its own.
 */
export function runWorkId(run: { id: string; attempt: number }) {
  return `${run.id}-${run.attempt}`;
}

/**
 * One run's directories. Hermes works in repo, scratch and out, with a
 * Hermes home of its own in hermes; pushRepo is the runner's own copy it
 * pushes from, outside anything Hermes can reach.
 */
export function runPaths(workDir: string, runId: string) {
  const root = path.join(workDir, "runs", runId);
  return {
    root,
    repo: path.join(root, "repo"),
    scratch: path.join(root, "scratch"),
    out: path.join(root, "out"),
    hermes: path.join(root, "hermes"),
    pushRepo: path.join(workDir, "push", `${runId}.git`),
  };
}

export type RunPaths = ReturnType<typeof runPaths>;
