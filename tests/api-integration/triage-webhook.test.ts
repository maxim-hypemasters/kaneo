import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { handleIssueOpened } from "../../apps/api/src/plugins/github/webhooks/issue-opened";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

vi.mock("../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: () => ({
    getInstallationOctokit: async () => ({
      rest: { issues: { createComment: async () => ({ id: 1 }) } },
    }),
  }),
}));
vi.mock("../../apps/api/src/plugins/github/utils/labels", () => ({
  addLabelsToIssue: async () => undefined,
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.restoreAllMocks();
  vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
});

async function openIssue(number: number, state: "open" | "closed") {
  const { user, workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  await db.insert(schema.projectTriageMemberTable).values({
    workspaceId: workspace.id,
    projectId: project.id,
    userId: user.id,
  });
  const [integration] = await db
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: "github",
      isActive: true,
      config: JSON.stringify({
        repositoryOwner: "team",
        repositoryName: "repo",
        repositoryId: 1,
        installationId: 2,
        verifiedGithubAccountId: "3",
        verifiedByUserId: "test-user",
        syncRules: {
          outgoing: { mode: "all" },
          incoming: { mode: "all" },
        },
      }),
    })
    .returning();
  await handleIssueOpened(
    {
      action: "opened",
      issue: {
        number,
        title: `Issue ${number}`,
        state,
        body: "Body",
        html_url: `https://github.com/team/repo/issues/${number}`,
        labels: [],
        user: { login: "author" },
      },
      installation: { id: 2 },
      repository: {
        id: 1,
        owner: { login: "team" },
        name: "repo",
        full_name: "team/repo",
      },
    },
    integration!.id,
  );
  return db.query.taskTable.findFirst({
    where: eq(schema.taskTable.projectId, project.id),
  });
}

it("sends an open issue to Triage with no Kaneo creator", async () => {
  expect(await openIssue(7, "open")).toMatchObject({
    status: "triage",
    columnId: null,
    createdBy: null,
  });
});

it("lets a closed issue skip Triage", async () => {
  expect((await openIssue(8, "closed"))?.status).toBe("done");
});
