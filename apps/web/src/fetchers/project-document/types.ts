import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

type Api = (typeof client)["project-document"];

export type ProjectDocument = InferResponseType<Api[":id"]["$get"], 200>;

export type ProjectDocumentTree = InferResponseType<
  Api["project"][":projectId"]["$get"],
  200
>;

export type ProjectPageSummary = ProjectDocumentTree["pages"][number];

export type FeatureDocumentGroup = ProjectDocumentTree["features"][number];
