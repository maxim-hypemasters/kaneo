import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function declineTriageTask(id: string, reason?: string) {
  const response = await client.triage.task[":id"].decline.$post({
    param: { id },
    json: reason ? { reason } : {},
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export default declineTriageTask;
