import { subscribeToEvent } from "../../events";
import { broadcastTeamsChanged } from "./broadcast-teams-changed";

subscribeToEvent<{ workspaceId: string }>(
  "team.changed",
  async ({ workspaceId }) => {
    if (!workspaceId) return;
    await broadcastTeamsChanged(workspaceId);
  },
);
