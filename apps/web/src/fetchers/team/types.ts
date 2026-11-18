import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

type WorkspaceApi = (typeof client)["team"]["workspace"][":workspaceId"];

export type TeamList = InferResponseType<WorkspaceApi["$get"], 200>;

// Linked projects the viewer can't access are left out by the API.
export type Team = TeamList[number];

export type TeamMember = Team["members"][number];

export type TeamProject = Team["projects"][number];
