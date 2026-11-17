import { client } from "@kaneo/libs";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";

// Puts the member back on the workspace default for one type.
export async function clearTimeOffAllowanceOverride(
  workspaceId: string,
  userId: string,
  type: TimeOffType,
) {
  const response = await client["time-off"].workspace[":workspaceId"].allowance[
    ":type"
  ][":userId"].$delete({ param: { workspaceId, type, userId } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
