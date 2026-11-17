import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getTimeOffAllowanceDefaults(workspaceId: string) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].allowance.$get({ param: { workspaceId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
