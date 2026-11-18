import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function deleteTeam(id: string) {
  const response = await client.team[":id"].$delete({ param: { id } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
