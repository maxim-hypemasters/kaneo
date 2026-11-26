import { resolveApiBaseUrl } from "@kaneo/libs";

/**
 * The absolute API URL a runner connects to. The web app's API URL may be
 * relative in a same-origin deployment, so it resolves against the page.
 */
export function resolveRunnerApiUrl(
  viteApiUrl: string | undefined,
  origin: string,
): string {
  return new URL(resolveApiBaseUrl(viteApiUrl), origin).href.replace(
    /\/+$/,
    "",
  );
}

/** The environment a runner container needs, one variable per line. */
export function runnerEnvSnippet(apiUrl: string, token: string): string {
  return `KANEO_API_URL=${apiUrl}\nKANEO_RUNNER_TOKEN=${token}`;
}
