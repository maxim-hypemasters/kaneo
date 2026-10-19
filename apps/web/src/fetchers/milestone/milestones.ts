import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type MilestoneInput = {
  title: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};
export type MilestoneCreateInput = MilestoneInput & { taskIds?: string[] };
export type Milestone = MilestoneInput & {
  id: string;
  featureId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  progress: { total: number; started: number; completed: number };
};

async function result<T>(response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
export async function getMilestones(featureId: string): Promise<Milestone[]> {
  return result(
    await client.milestone.feature[":featureId"].$get({ param: { featureId } }),
  );
}
export async function createMilestone(
  featureId: string,
  input: MilestoneCreateInput,
): Promise<Milestone> {
  return result(
    await client.milestone.feature[":featureId"].$post({
      param: { featureId },
      json: input,
    }),
  );
}
export async function updateMilestone(
  id: string,
  input: MilestoneInput,
): Promise<Milestone> {
  return result(
    await client.milestone[":id"].$patch({ param: { id }, json: input }),
  );
}
export async function deleteMilestone(id: string): Promise<void> {
  const response = await client.milestone[":id"].$delete({ param: { id } });
  if (!response.ok) throw await HttpError.fromResponse(response);
}
export async function reorderMilestones(
  featureId: string,
  milestoneIds: string[],
): Promise<Milestone[]> {
  return result(
    await client.milestone.feature[":featureId"].order.$put({
      param: { featureId },
      json: { milestoneIds },
    }),
  );
}
export async function setTaskMilestone(id: string, milestoneId: string | null) {
  return result(
    await client.task[":id"].milestone.$patch({
      param: { id },
      json: { milestoneId },
    }),
  );
}
