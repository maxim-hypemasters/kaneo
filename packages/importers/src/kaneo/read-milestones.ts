import { SourceHttpError } from "../http.js";
import type { ImportedMilestone } from "../types.js";
import { mapPriority } from "./mapping.js";
import type { KaneoBoardTask, KaneoClient, KaneoMember } from "./client.js";

export async function readMilestones(
  client: KaneoClient,
  tasks: KaneoBoardTask[],
  members: ReadonlyMap<string, KaneoMember> = new Map(),
): Promise<ImportedMilestone[]> {
  const milestones: ImportedMilestone[] = [];
  for (const feature of tasks.filter((task) => task.type === "feature")) {
    try {
      const found = await client.listMilestones(feature.id);
      milestones.push(
        ...found.map((milestone) => ({
          key: milestone.id,
          featureKey: feature.id,
          title: milestone.title,
          description: milestone.description,
          startDate: milestone.startDate ?? null,
          endDate:
            milestone.endDate === undefined
              ? (milestone.targetDate ?? null)
              : milestone.endDate,
          position: milestone.position,
          ...(milestone.status === undefined
            ? {}
            : { status: milestone.status }),
          ...(milestone.priority === undefined
            ? {}
            : { priority: mapPriority(milestone.priority) }),
          ...(milestone.releaseId === undefined
            ? {}
            : { releaseKey: milestone.releaseId }),
          ...(milestone.leadId && members.has(milestone.leadId)
            ? { lead: members.get(milestone.leadId)! }
            : {}),
        })),
      );
    } catch (error) {
      // The endpoint is absent on older Kaneo instances.
      if (!(error instanceof SourceHttpError) || error.status !== 404)
        throw error;
      break;
    }
  }
  return milestones;
}
