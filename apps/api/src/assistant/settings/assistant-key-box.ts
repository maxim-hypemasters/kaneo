import { openSecret, sealSecret } from "../../utils/secret-box";

// The key is bound to its workspace: a ciphertext copied to another
// workspace's row does not open.
const PURPOSE = "assistant-openrouter-key:v1";
const context = (workspaceId: string) => `workspace:${workspaceId}`;

export function sealAssistantKey(workspaceId: string, apiKey: string): string {
  return sealSecret(apiKey, PURPOSE, context(workspaceId));
}

/** Null when the key cannot be opened, for example after AUTH_SECRET changed. */
export function openAssistantKey(
  workspaceId: string,
  ciphertext: string,
): string | null {
  return openSecret(ciphertext, PURPOSE, context(workspaceId));
}
