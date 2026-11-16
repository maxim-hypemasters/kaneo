import { getTriageMemberIds } from "../read-triage-members";

export default async function getTriageMembers(projectId: string) {
  return { userIds: await getTriageMemberIds(projectId) };
}
