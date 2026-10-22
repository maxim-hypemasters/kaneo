import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export default async function getReleaseMilestoneCandidates(
  projectId: string,
  search: string,
  page: number,
  signal?: AbortSignal,
) {
  const response = await client.release.project[":projectId"][
    "milestone-link-candidates"
  ].$get(
    {
      param: { projectId },
      query: { q: search.trim(), page: String(page), limit: "50" },
    },
    { init: { signal } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export type ReleaseMilestoneCandidate = Awaited<
  ReturnType<typeof getReleaseMilestoneCandidates>
>["data"][number];
