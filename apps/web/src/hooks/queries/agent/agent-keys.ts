// One key factory for the AI agent's queries, so mutations and socket
// messages invalidate exactly what changed.
export const agentKeys = {
  /** Prefix of every task's agent state; project-wide changes refresh all. */
  tasks: ["task-agent"] as const,
  task: (taskId: string) => ["task-agent", taskId] as const,
  /** Under the task's key, so whatever refreshes the task's agent state
   * also marks its prompt outdated. */
  prompt: (taskId: string) => ["task-agent", taskId, "prompt"] as const,
  /** Prefix of every project's settings, which report runnerConfigured. */
  allProjectSettings: ["agent", "project-settings"] as const,
  projectSettings: (projectId: string) =>
    ["agent", "project-settings", projectId] as const,
  runner: (workspaceId: string) => ["agent", "runner", workspaceId] as const,
};
