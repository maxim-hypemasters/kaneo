import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { CreateTimeOffInput } from "./types";

export async function createTimeOffRequest(
  workspaceId: string,
  json: CreateTimeOffInput,
) {
  const response = await client["time-off"].workspace[":workspaceId"].$post({
    param: { workspaceId },
    json,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
