import { SourceHttpError } from "../http.js";
import type { ImportedMilestone } from "../types.js";
import type { KaneoBoardTask, KaneoClient } from "./client.js";

export async function readMilestones(
  client: KaneoClient,
  tasks: KaneoBoardTask[],
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
