import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { fakeGh, tempDir, testConfig } from "../test-support/fixtures";
import { markPullRequestReady } from "./mark-pull-request-ready";
import type { PullRequest } from "./pick-own-pull-request";
import { START_MARKER } from "./start-marker";

const PR_URL = "https://github.com/acme/app/pull/5";
const START_TEXT =
  "Work on [HUB-7](http://kaneo/task/t1) started from Kaneo; no changes yet.";
const START_BODY = `${START_TEXT}\n\n${START_MARKER}`;

async function mark(
  pullRequest: Omit<PullRequest, "body"> & { body?: string },
  failOn: string[] = [],
) {
  const root = await tempDir();
  const config = testConfig(root, { ghBin: await fakeGh(root, { failOn }) });
  const steps: string[] = [];
  await markPullRequestReady(config, {
    pullRequest: { body: START_BODY, ...pullRequest },
    body: "Fixed the login form.",
    startText: START_TEXT,
    token: "ghp_x",
    signal: new AbortController().signal,
    step: (message) => steps.push(message),
  });
  const logFile = path.join(root, "gh.log");
  const log = existsSync(logFile)
    ? (await readFile(logFile, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => line.replace(/ token=.*$/, ""))
    : [];
  const bodyFile = path.join(root, "gh-edit-body.txt");
  const editedBody = existsSync(bodyFile)
    ? await readFile(bodyFile, "utf8")
    : undefined;
  return { steps, log, editedBody };
}

describe("markPullRequestReady", () => {
  it("marks the draft Start opened ready, then gives it the Ship's body", async () => {
    const { log, editedBody } = await mark({
      url: PR_URL,
      isDraft: true,
      startedByKaneo: true,
    });
    expect(log).toEqual([
      `pr ready ${PR_URL}`,
      `pr edit ${PR_URL} --body-file -`,
    ]);
    expect(editedBody).toBe("Fixed the login form.");
  });

  it("keeps what people wrote on the draft above the Ship's body", async () => {
    const { editedBody } = await mark({
      url: PR_URL,
      isDraft: true,
      startedByKaneo: true,
      body: `${START_TEXT}\n\nDesign note: keep the old endpoint.\n\n${START_MARKER}`,
    });
    expect(editedBody).toBe(
      "Design note: keep the old endpoint.\n\n---\n\nFixed the login form.",
    );
  });

  it("leaves other pull requests alone", async () => {
    for (const pullRequest of [
      { url: PR_URL, isDraft: true, startedByKaneo: false },
      { url: PR_URL, isDraft: false, startedByKaneo: true },
    ])
      expect((await mark(pullRequest)).log).toEqual([]);
  });

  it("reports a refusal as a step and keeps Start's body", async () => {
    const { steps, log } = await mark(
      { url: PR_URL, isDraft: true, startedByKaneo: true },
      ["ready"],
    );
    expect(log).toEqual([`pr ready ${PR_URL}`]);
    expect(steps.at(-1)).toMatch(
      /^Couldn't mark the pull request ready for review: .*gh ready refused/,
    );
  });
});
