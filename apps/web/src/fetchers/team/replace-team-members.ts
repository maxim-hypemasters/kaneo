import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function replaceTeamMembers(id: string, userIds: string[]) {
  const response = await client.team[":id"].members.$put({
    param: { id },
    json: { userIds },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
