import type { RunnerConfig } from "../config";

/**
 * The environment for gh. gh reads GH_TOKEN for github.com, but only
 * GH_ENTERPRISE_TOKEN for a GitHub Enterprise Server host.
 */
export function ghEnv(
  config: RunnerConfig,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    PATH: env.PATH,
    HOME: env.HOME,
    GH_TOKEN: token,
    ...(config.githubHost !== "github.com"
      ? { GH_HOST: config.githubHost, GH_ENTERPRISE_TOKEN: token }
      : {}),
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    NO_COLOR: "1",
  };
}
