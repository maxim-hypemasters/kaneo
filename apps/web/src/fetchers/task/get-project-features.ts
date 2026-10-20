import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getProjectFeatures(projectId: string) {
  const response = await client.task.features[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return (await response.json()).map((feature) => ({ ...feature, projectId }));
}

export default getProjectFeatures;
