import type { RunContext } from "../kaneo/client";
import { START_MARKER } from "../ship/start-marker";

/** Start's own sentence in the draft; Ship drops it when it fills the draft in. */
export function startPullRequestText(context: RunContext) {
  return `Work on [${context.task.ticketId}](${context.task.url}) started from Kaneo; no changes yet.`;
}

/** The draft's body until a Ship fills it in; the marker lets Ship find it. */
export function startPullRequestBody(context: RunContext) {
  return `${startPullRequestText(context)}

${START_MARKER}`;
}
