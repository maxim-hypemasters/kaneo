import { client } from "@kaneo/libs";
import { collectTestCasePages } from "./collect-test-case-pages";

export function getReleaseTestCases(releaseId: string) {
  return collectTestCasePages((page) =>
    client["test-case"].release[":releaseId"].$get({
      param: { releaseId },
      query: { page, limit: "100" },
    }),
  );
}
