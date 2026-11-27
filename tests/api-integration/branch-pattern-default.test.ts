import { beforeEach, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { migrateBranchPatternDefault } from "../../apps/api/src/migrations/branch-pattern-default";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function integration(type: string, config: Record<string, unknown>) {
  const { workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  const [row] = await db
    .insert(schema.integrationTable)
    .values({ projectId: project.id, type, config: JSON.stringify(config) })
    .returning();
  return row!.id;
}

const configs = async () =>
  Object.fromEntries(
    (await db.select().from(schema.integrationTable)).map((row) => [
      row.id,
      row.config,
    ]),
  );

it("switches the stored old default once, and nothing else", async () => {
  const old = { repositoryOwner: "acme", branchPattern: "{slug}-{number}" };
  const github = await integration("github", old);
  const gitlab = await integration("gitlab", old);
  const gitea = await integration("gitea", old);
  const chosen = await integration("github", {
    branchPattern: "{slug}-{number}-{title}",
  });
  const custom = await integration("gitea", {
    branchPattern: "{slug}-{number}",
    customBranchRegex: "TASK-(\\d+)",
  });
  const slack = await integration("slack", old);
  const before = await configs();

  await migrateBranchPatternDefault();

  const after = await configs();
  for (const id of [github, gitlab, gitea])
    expect(JSON.parse(after[id]!)).toEqual({
      repositoryOwner: "acme",
      branchPattern: "{type}/{slug}-{number}/{title}",
    });
  for (const id of [chosen, custom, slack]) expect(after[id]).toBe(before[id]);

  // A pattern set back to the old default later is someone's choice.
  await db.update(schema.integrationTable).set({ config: JSON.stringify(old) });
  await migrateBranchPatternDefault();
  for (const config of Object.values(await configs()))
    expect(JSON.parse(config).branchPattern).toBe("{slug}-{number}");
});
