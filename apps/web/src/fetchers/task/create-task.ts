import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type CreateTaskRequest = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"] &
  InferRequestType<(typeof client)["task"][":projectId"]["$post"]>["param"];

async function createTask(
  title: string,
  description: string,
  projectId: string,
  userId: string | undefined,
  status: string | null | undefined,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  priority: CreateTaskRequest["priority"],
  customFields?: { fieldId: string; value: string }[],
  draftAssetIds?: string[],
  // releaseId: omitted, the task starts in its feature's release; null is none.
  placement: Pick<
    CreateTaskRequest,
    "type" | "featureId" | "releaseId" | "milestoneId" | "featureComposition"
  > = {},
) {
  if (!projectId) {
    throw new Error("No project selected for task creation");
  }

  const response = await client.task[":projectId"].$post({
    json: {
      title,
      description,
      ...(placement.type !== "feature"
        ? {
            ...(userId ? { userId } : {}),
            ...(status ? { status } : {}),
            startDate: startDate?.toISOString(),
            dueDate: dueDate?.toISOString(),
            priority,
          }
        : {}),
      customFields,
      draftAssetIds,
      ...(placement.type ? { type: placement.type } : {}),
      ...(placement.featureComposition !== undefined
        ? { featureComposition: placement.featureComposition }
        : {}),
      ...(placement.featureId ? { featureId: placement.featureId } : {}),
      ...(placement.milestoneId ? { milestoneId: placement.milestoneId } : {}),
      ...(placement.type !== "feature" && placement.releaseId !== undefined
        ? { releaseId: placement.releaseId }
        : {}),
    },
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default createTask;
