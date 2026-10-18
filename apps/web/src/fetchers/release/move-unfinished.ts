import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// null takes the unfinished items out of every release.
async function moveUnfinished(id: string, targetReleaseId: string | null) {
  const response = await client.release[":id"]["move-unfinished"].$post({
    param: { id },
    json: { targetReleaseId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default moveUnfinished;
