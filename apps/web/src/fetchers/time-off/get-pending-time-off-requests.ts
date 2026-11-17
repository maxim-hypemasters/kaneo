import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getPendingTimeOffRequests(workspaceId: string) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].pending.$get({ param: { workspaceId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
