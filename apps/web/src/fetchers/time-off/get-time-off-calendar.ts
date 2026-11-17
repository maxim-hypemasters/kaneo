import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// `lang` localizes the holiday names the viewer may see.
export async function getTimeOffCalendar(
  workspaceId: string,
  from: string,
  to: string,
  lang?: string,
) {
  const response = await client["time-off"].workspace[":workspaceId"].$get({
    param: { workspaceId },
    query: { from, to, ...(lang ? { lang } : {}) },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
