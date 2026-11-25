import { HttpError } from "@/lib/http-error";

export async function readTestCaseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json() as Promise<T>;
}
