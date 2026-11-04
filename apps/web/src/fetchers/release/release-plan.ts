import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type {
  ReleasePlan,
  ReleasePlanApproval,
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export function getReleasePlan(
  projectId: string,
  releaseId: string,
  timeZone: string,
): Promise<ReleasePlan> {
  return client["project-schedule"][":projectId"].release[":releaseId"]
    .$get({ param: { projectId, releaseId }, query: { timeZone } })
    .then(read<ReleasePlan>);
}

export function previewReleasePlan(
  projectId: string,
  releaseId: string,
  timeZone: string,
  changes?: ReleasePlanChanges,
): Promise<ReleasePlanPreview> {
  return client["project-schedule"][":projectId"].release[":releaseId"].preview
    .$post({
      param: { projectId, releaseId },
      json: { timeZone, ...(changes ? { changes } : {}) },
    })
    .then(read<ReleasePlanPreview>);
}

export function applyReleasePlan(
  projectId: string,
  releaseId: string,
  preview: ReleasePlanApproval,
): Promise<ReleasePlan> {
  return client["project-schedule"][":projectId"].release[":releaseId"].apply
    .$post({ param: { projectId, releaseId }, json: preview })
    .then(read<ReleasePlan>);
}
