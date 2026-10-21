import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getReleaseMilestones(
  id: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const response = await client.release[":id"].milestones.$get({
    param: { id },
    query: { timeZone },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export type ReleaseMilestone = Awaited<
  ReturnType<typeof getReleaseMilestones>
>[number];

export default getReleaseMilestones;
