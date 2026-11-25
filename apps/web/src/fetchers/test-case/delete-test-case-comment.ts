import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function deleteTestCaseComment(
  testCaseId: string,
  commentId: string,
) {
  const response = await client["test-case"][":id"].comments[
    ":commentId"
  ].$delete({ param: { id: testCaseId, commentId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
}
