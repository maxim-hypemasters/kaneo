import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getFeatureIssues(
  featureId: string,
  options: {
    search: string;
    page: number;
    milestoneId?: string;
    archived: "exclude" | "include";
  },
  signal?: AbortSignal,
) {
  const response = await client.feature[":id"].issues.$get(
    {
      param: { id: featureId },
      query: {
        search: options.search,
        page: String(options.page),
        limit: "50",
        milestoneId: options.milestoneId,
        archived: options.archived,
      },
    },
    { init: { signal } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export type FeatureIssuesPage = Awaited<ReturnType<typeof getFeatureIssues>>;
export type FeatureIssue = FeatureIssuesPage["data"][number];
