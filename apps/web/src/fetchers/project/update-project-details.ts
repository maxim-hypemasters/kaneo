import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function updateProjectDetails({
  id,
  ...json
}: {
  id: string;
  name?: string;
  description?: string;
}) {
  const response = await client.project[":id"].details.$patch({
    param: { id },
    json,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}

export default updateProjectDetails;
