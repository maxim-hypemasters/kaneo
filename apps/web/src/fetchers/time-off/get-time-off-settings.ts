import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Needs time_off:approve. Members read their deadline from GET holidays.
export async function getTimeOffSettings(workspaceId: string) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].settings.$get({ param: { workspaceId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
