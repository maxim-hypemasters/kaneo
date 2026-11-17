import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function cancelTimeOffRequest(id: string) {
  const response = await client["time-off"][":id"].cancel.$post({
    param: { id },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
