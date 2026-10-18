import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type CreateReleaseInput = InferRequestType<
  (typeof client)["release"]["project"][":projectId"]["$post"]
>["json"];

async function createRelease(projectId: string, data: CreateReleaseInput) {
  const response = await client.release.project[":projectId"].$post({
    param: { projectId },
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default createRelease;
