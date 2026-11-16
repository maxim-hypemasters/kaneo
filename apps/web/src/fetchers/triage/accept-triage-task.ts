import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function acceptTriageTask(id: string) {
  const response = await client.triage.task[":id"].accept.$post({
    param: { id },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export default acceptTriageTask;
