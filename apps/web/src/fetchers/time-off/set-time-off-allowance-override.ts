import { client } from "@kaneo/libs";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";

export async function setTimeOffAllowanceOverride(
  workspaceId: string,
  userId: string,
  type: TimeOffType,
  days: number,
) {
  const response = await client["time-off"].workspace[":workspaceId"].allowance[
    ":type"
  ][":userId"].$put({ param: { workspaceId, type, userId }, json: { days } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
