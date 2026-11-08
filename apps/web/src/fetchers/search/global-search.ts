import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

import { HttpError } from "@/lib/http-error";

export type SearchType = NonNullable<
  InferRequestType<(typeof client)["search"]["$get"]>["query"]["type"]
>;

export type SearchResultItem = InferResponseType<
  (typeof client)["search"]["$get"],
  200
>["results"][number];

type SearchParams = {
  q: string;
  type?: SearchType;
  workspaceId: string;
  projectId?: string;
  limit?: number;
};

async function globalSearch(params: SearchParams) {
  const queryParams = {
    ...params,
    limit: params.limit?.toString(),
  };

  const response = await client.search.$get({
    query: queryParams,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default globalSearch;
