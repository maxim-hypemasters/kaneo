/**
 * The instance-wide kill switch. DISABLE_ASSISTANT=true hides the assistant
 * from every workspace, whatever keys their admins saved.
 */
export function isAssistantEnabled(): boolean {
  return process.env.DISABLE_ASSISTANT !== "true";
}
