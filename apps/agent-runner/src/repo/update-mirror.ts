import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { RunnerConfig } from "../config";
import { git, repositoryUrl } from "./git";
import { mirrorPath } from "./work-paths";

/** Fetches the cached mirror, or clones it. Call it under the repo lock. */
export async function updateMirror(
  config: RunnerConfig,
  repository: string,
  token: string | null,
  signal?: AbortSignal,
) {
  const mirror = mirrorPath(config.workDir, repository);
  if (existsSync(mirror))
    await git(config, ["--git-dir", mirror, "fetch", "--prune", "origin"], {
      token,
      signal,
    });
  else {
    await mkdir(path.dirname(mirror), { recursive: true });
    await git(
      config,
      [
        "clone",
        "--mirror",
        "--quiet",
        repositoryUrl(config, repository),
        mirror,
      ],
      { token, signal },
    );
  }
  return mirror;
}
