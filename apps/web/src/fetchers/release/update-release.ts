import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

// Omitted fields stay as they are; a null description clears it.
export type UpdateReleaseInput = InferRequestType<
  (typeof client)["release"][":id"]["$put"]
>["json"];

async function updateRelease(id: string, data: UpdateReleaseInput) {
  const response = await client.release[":id"].$put({
    param: { id },
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateRelease;
