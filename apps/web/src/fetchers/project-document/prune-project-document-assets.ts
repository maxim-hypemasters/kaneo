import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Sent with keepalive so it still runs while the page is being closed.
export async function pruneProjectDocumentAssets(
  id: string,
  assetIds: string[],
) {
  const response = await client["project-document"][":id"].assets.prune.$post(
    { param: { id }, json: { assetIds } },
    { init: { keepalive: true } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
