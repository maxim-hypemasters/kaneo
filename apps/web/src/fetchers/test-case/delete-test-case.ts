import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function deleteTestCase(id: string) {
  const response = await client["test-case"][":id"].$delete({ param: { id } });
  if (!response.ok) throw await HttpError.fromResponse(response);
}
