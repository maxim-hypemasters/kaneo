import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function updateTeam(id: string, name: string) {
  const response = await client.team[":id"].$patch({
    param: { id },
    json: { name },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
