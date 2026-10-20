import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
export async function getFeatureLibrary(
  projectId: string,
  search: string,
  archived: boolean,
  page: number,
) {
  const response = await client.task["feature-library"][":projectId"].$get({
    param: { projectId },
    query: {
      search,
      archived: String(archived) as "true" | "false",
      page: String(page),
      limit: "30",
    },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
export async function archiveFeature(id: string, archived: boolean) {
  const response = await client.task[":id"]["feature-archive"].$put({
    param: { id },
    json: { archived },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
