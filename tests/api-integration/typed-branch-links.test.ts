import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { handleGiteaPullRequestOpened } from "../../apps/api/src/plugins/gitea/webhooks/pull-request-opened";
import { handleGiteaPush } from "../../apps/api/src/plugins/gitea/webhooks/push";
import { handlePullRequestOpened } from "../../apps/api/src/plugins/github/webhooks/pull-request-opened";
import { handlePush } from "../../apps/api/src/plugins/github/webhooks/push";
import { handleGitlabMergeRequestOpened } from "../../apps/api/src/plugins/gitlab/webhooks/merge-request-opened";
import { handleGitlabPush } from "../../apps/api/src/plugins/gitlab/webhooks/push";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

vi.mock("../../apps/api/src/events", () => ({
  publishEvent: vi.fn(async () => undefined),
}));

const repository = {
  id: 20,
  owner: { login: "owner" },
  name: "repo",
  html_url: "https://git.example/owner/repo",
};

// An integration that never saved a branch pattern gets the default.
async function createFixture(provider: string) {
  const { user, workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    slug: "KAN",
  });
  const tasks = await db
    .insert(schema.taskTable)
    .values(
      [
        { projectId: project.id, number: 1, title: "Tooltip", type: "task" },
        { projectId: project.id, number: 2, title: "Login", type: "bug" },
        { projectId: project.id, number: 3, title: "Old branch", type: "task" },
      ].map((task, position) => ({ ...task, status: "to-do", position })),
    )
    .returning();
  const [integration] = await db
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: provider,
      config: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "test-only",
        repositoryOwner: "owner",
        repositoryName: "repo",
        projectPath: "owner/repo",
        installationId: 10,
        repositoryId: 20,
        verifiedGithubAccountId: "123",
        verifiedByUserId: user.id,
        statusTransitions: {
          onBranchPush: "in-progress",
          onPROpen: "in-review",
        },
      }),
    })
    .returning();
  return { integration: integration!, tasks };
}

describe.each(["github", "gitea", "gitlab"])(
  "%s under the default branch pattern",
  (provider) => {
    let fixture: Awaited<ReturnType<typeof createFixture>>;
    const status = async (index: number) =>
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, fixture.tasks[index]!.id),
        })
      )?.status;
    const links = (index: number, resourceType: string) =>
      db.query.externalLinkTable.findMany({
        where: and(
          eq(schema.externalLinkTable.taskId, fixture.tasks[index]!.id),
          eq(schema.externalLinkTable.resourceType, resourceType),
        ),
      });
    const push = (branch: string) => {
      const ref = `refs/heads/${branch}`;
      if (provider === "github")
        return handlePush({
          ref,
          after: "abc",
          installation: { id: 10 },
          repository,
        });
      if (provider === "gitea")
        return handleGiteaPush(
          { ref, after: "abc", repository },
          fixture.integration.id,
        );
      return handleGitlabPush(
        {
          ref,
          after: "abc",
          project: {
            id: 20,
            path_with_namespace: "owner/repo",
            web_url: "https://git.example/owner/repo",
          },
        },
        fixture.integration.id,
      );
    };
    const openPullRequest = (branch: string) => {
      if (provider === "gitlab")
        return handleGitlabMergeRequestOpened(
          {
            project: {
              id: 20,
              name: "repo",
              path_with_namespace: "owner/repo",
              web_url: "https://git.example/owner/repo",
            },
            object_attributes: {
              iid: 1,
              title: "change",
              description: null,
              url: "https://git.example/owner/repo/-/merge_requests/1",
              state: "opened",
              action: "open",
              source_branch: branch,
              draft: false,
            },
          },
          fixture.integration.id,
        );
      const request = {
        action: "opened",
        installation: { id: 10 },
        repository,
        pull_request: {
          number: 1,
          title: "change",
          body: null,
          html_url: "https://git.example/owner/repo/pull/1",
          state: "open",
          draft: false,
          merged: false,
          head: { ref: branch },
          user: { login: "author" },
        },
      };
      return provider === "github"
        ? handlePullRequestOpened(request)
        : handleGiteaPullRequestOpened(request, fixture.integration.id);
    };

    beforeEach(async () => {
      await resetTestDatabase();
      fixture = await createFixture(provider);
    });

    it("links a task's feature/ push and a bug's bugfix/ push", async () => {
      await push("feature/kan-1/tooltip");
      await push("bugfix/kan-2/login");

      expect(await status(0)).toBe("in-progress");
      expect(await links(0, "branch")).toHaveLength(1);
      expect(await status(1)).toBe("in-progress");
      expect(await links(1, "branch")).toHaveLength(1);
    });

    it("no longer links an old-default branch by name", async () => {
      await push("kan-3");

      expect(await status(2)).toBe("to-do");
      expect(await links(2, "branch")).toHaveLength(0);
    });

    it("links a pull request from a bugfix/ branch without a title", async () => {
      await openPullRequest("bugfix/kan-2");

      expect(await status(1)).toBe("in-review");
      expect(await links(1, "pull_request")).toHaveLength(1);
    });
  },
);
