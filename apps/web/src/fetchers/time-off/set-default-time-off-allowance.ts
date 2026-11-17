import { client } from "@kaneo/libs";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";

export async function setDefaultTimeOffAllowance(
  workspaceId: string,
  type: TimeOffType,
  days: number,
) {
  const response = await client["time-off"].workspace[":workspaceId"].allowance[
    ":type"
  ].$put({ param: { workspaceId, type }, json: { days } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
