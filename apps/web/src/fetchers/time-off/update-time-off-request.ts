import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { UpdateTimeOffInput } from "./types";

export async function updateTimeOffRequest(
  id: string,
  json: UpdateTimeOffInput,
) {
  const response = await client["time-off"][":id"].$patch({
    param: { id },
    json,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
