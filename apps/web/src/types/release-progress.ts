import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type ReleaseProgressHistory = InferResponseType<
  (typeof client)["release"][":id"]["progress"]["$get"],
  200
>;

export type ReleaseProgressCounts = ReleaseProgressHistory["current"];

export type ReleaseProgressPoint = ReleaseProgressHistory["points"][number];
