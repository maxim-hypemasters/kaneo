import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getReleaseProgress(id: string, timeZone: string) {
  const response = await client.release[":id"].progress.$get({
    param: { id },
    query: { timeZone },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getReleaseProgress;
