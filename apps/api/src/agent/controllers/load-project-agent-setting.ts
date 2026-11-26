import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  integrationTable,
  projectAgentSettingTable,
} from "../../database/schema";

const DEFAULTS = {
  enabled: false,
  autoAssess: true,
  repository: null as string | null,
  baseBranch: "main",
  instructions: "",
  readyThreshold: 80,
};

export type ProjectAgentSetting = typeof DEFAULTS;

export async function loadProjectAgentSetting(
  projectId: string,
): Promise<ProjectAgentSetting> {
  const [row] = await db
    .select({
      enabled: projectAgentSettingTable.enabled,
      autoAssess: projectAgentSettingTable.autoAssess,
      repository: projectAgentSettingTable.repository,
      baseBranch: projectAgentSettingTable.baseBranch,
      instructions: projectAgentSettingTable.instructions,
      readyThreshold: projectAgentSettingTable.readyThreshold,
    })
    .from(projectAgentSettingTable)
    .where(eq(projectAgentSettingTable.projectId, projectId))
    .limit(1);
  return row ?? DEFAULTS;
}

/** The repository and branch pattern of the project's GitHub integration. */
export async function loadGithubBinding(
  projectId: string,
): Promise<{ repository: string; branchPattern?: string } | null> {
  const [row] = await db
    .select({ config: integrationTable.config })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "github"),
      ),
    )
    .limit(1);
  if (!row) return null;
  try {
    const config = JSON.parse(row.config) as {
      repositoryOwner?: unknown;
      repositoryName?: unknown;
      branchPattern?: unknown;
    };
    if (
      typeof config.repositoryOwner !== "string" ||
      typeof config.repositoryName !== "string"
    )
      return null;
    return {
      repository: `${config.repositoryOwner}/${config.repositoryName}`,
      branchPattern:
        typeof config.branchPattern === "string"
          ? config.branchPattern
          : undefined,
    };
  } catch {
    return null;
  }
}

/** The project's setting with the repository falling back to GitHub's. */
export async function loadEffectiveAgentSetting(projectId: string) {
  const [setting, github] = await Promise.all([
    loadProjectAgentSetting(projectId),
    loadGithubBinding(projectId),
  ]);
  return {
    ...setting,
    repository: setting.repository ?? github?.repository ?? null,
    branchPattern: github?.branchPattern,
  };
}
