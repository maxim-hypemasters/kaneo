import { client } from "@kaneo/libs";
import { collectTestCasePages } from "./collect-test-case-pages";

export function getFeatureTestCases(featureId: string) {
  return collectTestCasePages((page) =>
    client["test-case"].feature[":featureId"].$get({
      param: { featureId },
      query: { page, limit: "100" },
    }),
  );
}
