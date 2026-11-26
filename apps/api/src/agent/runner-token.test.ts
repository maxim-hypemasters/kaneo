import { describe, expect, it } from "vite-plus/test";
import {
  generateRunnerToken,
  hashRunnerToken,
  RUNNER_TOKEN_PREFIX,
} from "./runner-token";

describe("generateRunnerToken", () => {
  it("returns a prefixed token, its hash and a display prefix", () => {
    const { token, hash, prefix } = generateRunnerToken();
    expect(token.startsWith(RUNNER_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    expect(hash).toBe(hashRunnerToken(token));
    expect(hash).not.toContain(token);
    expect(token.startsWith(prefix)).toBe(true);
  });

  it("never repeats", () => {
    expect(generateRunnerToken().token).not.toBe(generateRunnerToken().token);
  });
});
