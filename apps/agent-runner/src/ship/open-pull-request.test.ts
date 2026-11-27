import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { fakeGh, tempDir, testConfig } from "../test-support/fixtures";
import { openPullRequest } from "./open-pull-request";
import { START_MARKER } from "./start-marker";

async function open(
  options: { draft?: boolean; body?: string; pulls?: unknown[] } = {},
) {
  const root = await tempDir();
  const config = testConfig(root, {
    ghBin: await fakeGh(root, { pulls: options.pulls }),
  });
  const pullRequest = await openPullRequest(config, {
    repository: "acme/app",
    baseBranch: "main",
    branch: "hub-7",
    title: "HUB-7: Fix login",
    body: options.body ?? "Fixed it.",
    draft: options.draft,
    token: "ghp_x",
    signal: new AbortController().signal,
  });
  const log = await readFile(path.join(root, "gh.log"), "utf8");
  return { root, pullRequest, log };
}

describe("openPullRequest", () => {
  it("opens a draft when asked, and knows Start's from its marker", async () => {
    const body = `Work started from Kaneo.\n\n${START_MARKER}`;
    const { root, pullRequest, log } = await open({ draft: true, body });
    expect(pullRequest).toEqual({
      url: "https://github.com/acme/app/pull/12",
      isDraft: true,
      startedByKaneo: true,
      body,
    });
    expect(log).toContain(
      "pr create --repo acme/app --base main --head hub-7 --title HUB-7: Fix login --body-file - --draft",
    );
    expect(await readFile(path.join(root, "gh-create-body.txt"), "utf8")).toBe(
      body,
    );
  });

  it("opens one ready for review otherwise", async () => {
    const { pullRequest, log } = await open();
    expect(pullRequest).toEqual({
      url: "https://github.com/acme/app/pull/12",
      isDraft: false,
      startedByKaneo: false,
      body: "Fixed it.",
    });
    expect(log).toContain("pr create");
    expect(log).not.toContain("--draft");
  });

  it("reuses the branch's open pull request, asking gh for its draft state and body", async () => {
    const { pullRequest, log } = await open({
      draft: true,
      pulls: [
        {
          url: "https://github.com/acme/app/pull/5",
          isCrossRepository: false,
          headRepositoryOwner: { login: "acme" },
          isDraft: true,
          body: `Started.\n\n${START_MARKER}`,
        },
      ],
    });
    expect(pullRequest).toEqual({
      url: "https://github.com/acme/app/pull/5",
      isDraft: true,
      startedByKaneo: true,
      body: `Started.\n\n${START_MARKER}`,
    });
    expect(log).toContain(
      "--json url,isCrossRepository,headRepositoryOwner,isDraft,body",
    );
    expect(log).not.toContain("pr create");
  });
});
