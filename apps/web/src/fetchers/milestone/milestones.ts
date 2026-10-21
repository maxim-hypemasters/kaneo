import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type MilestoneInput = {
  title?: string;
  leadId?: string | null;
  priority?: "no-priority" | "low" | "medium" | "high" | "urgent";
  releaseId?: string | null;
  description?: string | null;
};
export type MilestoneCreateInput = MilestoneInput & {
  title: string;
  taskIds?: string[];
  newTasks?: MilestoneTaskDraft[];
};
export type MilestoneTaskDraft = {
  title: string;
  type: "task" | "bug";
};
export type Milestone = MilestoneInput & {
  title: string;
  leadId: string | null;
  status: string;
  columnId: string | null;
  priority: "no-priority" | "low" | "medium" | "high" | "urgent";
  releaseId: string | null;
  startDate: string | null;
  endDate: string | null;
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
export async function getMilestones(
  featureId: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<Milestone[]> {
  return result(
    await client.milestone.feature[":featureId"].$get({
      param: { featureId },
      query: { timeZone },
    }),
  );
}
export async function createMilestone(
  featureId: string,
  input: MilestoneCreateInput,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<Milestone> {
  return result(
    await client.milestone.feature[":featureId"].$post({
      param: { featureId },
      json: input,
      query: { timeZone },
    }),
  );
}
export async function updateMilestone(
  id: string,
  input: MilestoneInput,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<Milestone> {
  return result(
    await client.milestone[":id"].$patch({
      param: { id },
      json: input,
      query: { timeZone },
    }),
  );
}
export async function deleteMilestone(id: string): Promise<void> {
  const response = await client.milestone[":id"].$delete({ param: { id } });
  if (!response.ok) throw await HttpError.fromResponse(response);
}
export async function reorderMilestones(
  featureId: string,
  milestoneIds: string[],
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<Milestone[]> {
  return result(
    await client.milestone.feature[":featureId"].order.$put({
      param: { featureId },
      json: { milestoneIds },
      query: { timeZone },
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

export type MilestoneWithFeature = Milestone & {
  featureTitle: string;
  projectId: string;
};
export async function getMilestone(
  id: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<Milestone> {
  return result(
    await client.milestone[":id"].$get({
      param: { id },
      query: { timeZone },
    }),
  );
}
export async function getProjectMilestones(
  projectId: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<MilestoneWithFeature[]> {
  const all: MilestoneWithFeature[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await client.milestone.project[":projectId"].$get({
      param: { projectId },
      query: { page: String(page), limit: "100", timeZone },
    });
    const value = await result<{
      data: MilestoneWithFeature[];
      pagination: { totalPages: number };
    }>(response);
    all.push(...value.data);
    totalPages = value.pagination.totalPages;
    page++;
  } while (page <= totalPages);
  return all;
}
