import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Omit userId for your own requests.
export async function getTimeOffRequests(
  workspaceId: string,
  year: number,
  userId?: string,
) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].requests.$get({
    param: { workspaceId },
    query: { year: String(year), ...(userId ? { userId } : {}) },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
