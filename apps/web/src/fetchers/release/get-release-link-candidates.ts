import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type ReleaseLinkKind = "task" | "milestone";

export default async function getReleaseLinkCandidates(
  id: string,
  kind: ReleaseLinkKind,
  search: string,
  page: number,
  signal?: AbortSignal,
) {
  const response = await client.release[":id"]["link-candidates"].$get(
    {
      param: { id },
      query: { kind, q: search.trim(), page: String(page), limit: "50" },
    },
    { init: { signal } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export type ReleaseLinkCandidate = Awaited<
  ReturnType<typeof getReleaseLinkCandidates>
>["data"][number];
