import type { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

type TestCaseApi = (typeof client)["test-case"];

export type TestCase = InferResponseType<TestCaseApi[":id"]["$get"], 200>;

export type TestCaseList = InferResponseType<
  TestCaseApi["project"][":projectId"]["$get"],
  200
>;

export type TestCaseSummary = TestCaseList["data"][number];

export type TestCaseStatus = TestCase["status"];

export type TestCaseStatusCounts = TestCaseList["statusCounts"];

export type TestCaseListQuery = InferRequestType<
  TestCaseApi["project"][":projectId"]["$get"]
>["query"];

export type CreateTestCaseInput = InferRequestType<
  TestCaseApi["project"][":projectId"]["$post"]
>["json"];

export type UpdateTestCaseInput = InferRequestType<
  TestCaseApi[":id"]["$patch"]
>["json"];

export type TestCaseCommentList = InferResponseType<
  TestCaseApi[":id"]["comments"]["$get"],
  200
>;

export type TestCaseComment = TestCaseCommentList["data"][number];

// Every test case of a Feature or release, with counts for the whole set.
export type TestCaseCollection = {
  data: TestCaseSummary[];
  statusCounts: TestCaseStatusCounts;
};
