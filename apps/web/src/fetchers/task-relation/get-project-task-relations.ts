import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

export type TaskRelationType = "subtask" | "blocks" | "related";

async function getProjectTaskRelations(
  projectId: string,
  relationType?: TaskRelationType,
) {
  const response = await client["task-relation"].project[":projectId"].$get({
    param: { projectId },
    query: { relationType },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getProjectTaskRelations;
