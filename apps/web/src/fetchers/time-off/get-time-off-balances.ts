import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getTimeOffBalances(workspaceId: string, year: number) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].balances.$get({
    param: { workspaceId },
    query: { year: String(year) },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
