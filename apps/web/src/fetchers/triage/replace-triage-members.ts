import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function replaceTriageMembers(projectId: string, userIds: string[]) {
  const response = await client.triage.project[":projectId"].members.$put({
    param: { projectId },
    json: { userIds },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export default replaceTriageMembers;
