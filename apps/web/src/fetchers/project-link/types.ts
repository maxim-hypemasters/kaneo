import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

type ProjectLinksApi = (typeof client)["project-link"]["project"][":projectId"];

export type ProjectLink = InferResponseType<
  ProjectLinksApi["$get"],
  200
>[number];
