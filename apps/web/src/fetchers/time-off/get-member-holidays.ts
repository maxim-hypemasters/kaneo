import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// A member's calendar and its holidays in one Jan-Dec year, weekends
// included. Omit userId for your own.
export async function getMemberHolidays(
  workspaceId: string,
  year: number,
  { userId, lang }: { userId?: string; lang?: string } = {},
) {
  const response = await client["time-off"].workspace[
    ":workspaceId"
  ].holidays.$get({
    param: { workspaceId },
    query: {
      year: String(year),
      ...(userId ? { userId } : {}),
      ...(lang ? { lang } : {}),
    },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
