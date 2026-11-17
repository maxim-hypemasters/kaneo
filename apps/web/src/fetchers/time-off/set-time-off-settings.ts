import { client } from "@kaneo/libs";
import type { TimeOffSettingsInput } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";

export async function setTimeOffSettings(
  workspaceId: string,
  settings: TimeOffSettingsInput,
) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].settings.$put({ param: { workspaceId }, json: settings });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
