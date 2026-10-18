import type { Release } from "../api/releases.js";

// A release of project p1, for tests that need one.
export function releaseFixture(
  id: string,
  name: string,
  overrides: Partial<Release> = {},
): Release {
  return {
    id,
    projectId: "p1",
    name,
    description: null,
    startDate: "2026-10-01",
    codeFreezeDate: "2026-10-20",
    submissionDate: "2026-10-24",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    progress: {
      tasks: { total: 0, completed: 0 },
      features: { total: 0, completed: 0 },
      unfinished: 0,
    },
    ...overrides,
  };
}
