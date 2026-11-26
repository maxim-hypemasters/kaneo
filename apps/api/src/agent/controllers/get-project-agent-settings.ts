import { eq } from "drizzle-orm";
import db from "../../database";
import { projectTable } from "../../database/schema";
import {
  loadGithubBinding,
  loadProjectAgentSetting,
} from "./load-project-agent-setting";
import { loadWorkspaceRunner } from "./load-workspace-runner";

export async function getProjectAgentSettings(projectId: string) {
  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);
  const [setting, github, runner] = await Promise.all([
    loadProjectAgentSetting(projectId),
    loadGithubBinding(projectId),
    project ? loadWorkspaceRunner(project.workspaceId) : null,
  ]);
  return {
    ...setting,
    suggestedRepository: github?.repository ?? null,
    runnerConfigured: runner !== null,
  };
}
