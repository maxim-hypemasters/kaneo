export function jsonRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}
