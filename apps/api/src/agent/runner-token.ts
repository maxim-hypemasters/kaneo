import { createHash, randomBytes } from "node:crypto";

export const RUNNER_TOKEN_PREFIX = "kar_";

export function hashRunnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new runner token; only its hash and a short prefix are stored. */
export function generateRunnerToken() {
  const token = `${RUNNER_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashRunnerToken(token), prefix: token.slice(0, 10) };
}
