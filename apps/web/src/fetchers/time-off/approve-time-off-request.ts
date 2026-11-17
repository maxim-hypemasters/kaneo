import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// `version` is the one the approver reviewed; a newer edit returns 409
// TIME_OFF_CHANGED.
export async function approveTimeOffRequest(id: string, version: number) {
  const response = await client["time-off"][":id"].approve.$post({
    param: { id },
    json: { version },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
