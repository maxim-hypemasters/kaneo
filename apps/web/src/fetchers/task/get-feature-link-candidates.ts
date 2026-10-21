import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export default async function getFeatureLinkCandidates(
  projectId: string,
  search: string,
  page: number,
  signal?: AbortSignal,
) {
  const response = await client.task["feature-link-candidates"][
    ":projectId"
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

export type FeatureLinkCandidate = Awaited<
  ReturnType<typeof getFeatureLinkCandidates>
>["data"][number];
