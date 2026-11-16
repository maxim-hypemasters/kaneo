import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getTriageMembers(projectId: string) {
  const response = await client.triage.project[":projectId"].members.$get({
    param: { projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export default getTriageMembers;
