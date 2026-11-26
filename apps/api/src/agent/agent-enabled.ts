/**
 * The instance-wide kill switch. DISABLE_AI_AGENT=true hides the AI agent
 * from every workspace and stops runners from claiming work.
 */
export function isAiAgentEnabled(): boolean {
  return process.env.DISABLE_AI_AGENT !== "true";
}
