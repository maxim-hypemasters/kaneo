import { publishEvent } from "../events";

export function publishTeamsChanged(workspaceId: string) {
  return publishEvent("team.changed", { workspaceId });
}
