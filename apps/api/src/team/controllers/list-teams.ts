import db from "../../database";
import { readTeams } from "../read-teams";

export default function listTeams(workspaceId: string, viewerId: string) {
  return readTeams(db, { workspaceId, viewerId });
}
