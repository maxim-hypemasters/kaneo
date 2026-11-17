import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Omit userId for your own balance.
export async function getTimeOffBalance(
  workspaceId: string,
  year: number,
  userId?: string,
) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].balance.$get({
    param: { workspaceId },
    query: { year: String(year), ...(userId ? { userId } : {}) },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
