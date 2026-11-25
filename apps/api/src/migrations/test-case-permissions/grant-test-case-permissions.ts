const TEST_CASE_ACTIONS = ["create", "read", "update", "delete"] as const;

// Test cases are a new resource, so stored roles have no `test_case` key and
// would get no access on upgrade. Test cases sit beside milestones, so each
// stored set gets the same actions it has on milestones.
// Returns the new JSON, or null when the set is unreadable, already decides
// test cases (even with an empty list), or has no milestone actions.
export function grantTestCasePermissions(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const permissions = value as Record<string, unknown>;
  if (Object.hasOwn(permissions, "test_case")) return null;

  const milestone = permissions.milestone;
  if (!Array.isArray(milestone)) return null;
  const testCase = TEST_CASE_ACTIONS.filter((action) =>
    milestone.includes(action),
  );
  if (testCase.length === 0) return null;

  return JSON.stringify({ ...permissions, test_case: testCase });
}
