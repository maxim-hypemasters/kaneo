import type { TestCaseScope } from "./schema";

// The project and workspace the access middleware authorized, and the caller.
export const testCaseScope = (c: {
  get: (key: "userId" | "authorizedProjectId" | "workspaceId") => string;
}): TestCaseScope => ({
  projectId: c.get("authorizedProjectId"),
  workspaceId: c.get("workspaceId"),
  userId: c.get("userId"),
});
